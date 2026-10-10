package main

import (
	"bufio"
	"github.com/gorilla/websocket"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// Segura o upgrade após a primeira checagem para reproduzir admissões simultâneas.
type delayedHijacker struct {
	http.ResponseWriter
	entered chan struct{}
	release <-chan struct{}
}

func (w delayedHijacker) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	w.entered <- struct{}{}
	<-w.release
	return w.ResponseWriter.(http.Hijacker).Hijack()
}

func TestConcurrentAdmission(t *testing.T) {
	entered, release := make(chan struct{}, 20), make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { wsHandler(delayedHijacker{w, entered, release}, r) }))
	defer server.Close()
	start := make(chan struct{})
	var wg sync.WaitGroup
	var mu sync.Mutex
	var clients []*websocket.Conn
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			c, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http")+"?sala=1234", nil)
			if err == nil {
				mu.Lock()
				clients = append(clients, c)
				mu.Unlock()
			}
		}()
	}
	close(start)
	for i := 0; i < 20; i++ {
		<-entered
	}
	close(release)
	wg.Wait()
	defer func() {
		for _, c := range clients {
			c.Close()
		}
	}()
	// Conexões recusadas após upgrade devem receber fechamento imediatamente.
	alive := 0
	for _, c := range clients {
		c.SetReadDeadline(time.Now().Add(20 * time.Millisecond))
		_, _, err := c.ReadMessage()
		if n, ok := err.(interface{ Timeout() bool }); ok && n.Timeout() {
			alive++
		}
	}
	if alive > maxRoomClients {
		t.Fatalf("%d clientes ativos; limite %d", alive, maxRoomClients)
	}
}

func TestRoomValidationAndIsolation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(wsHandler))
	defer server.Close()
	for _, room := range []string{"abc", "12", "1234567"} {
		r, e := http.Get(server.URL + "?sala=" + room)
		if e != nil {
			t.Fatal(e)
		}
		r.Body.Close()
		if r.StatusCode != 400 {
			t.Fatalf("sala %s: %d", room, r.StatusCode)
		}
	}
	dial := func(room string) *websocket.Conn {
		c, _, e := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http")+"?sala="+room, nil)
		if e != nil {
			t.Fatal(e)
		}
		t.Cleanup(func() { c.Close() })
		return c
	}
	a, b, c := dial("5555"), dial("5555"), dial("6666")
	if e := a.WriteMessage(websocket.TextMessage, []byte(`{"type":"hello"}`)); e != nil {
		t.Fatal(e)
	}
	b.SetReadDeadline(time.Now().Add(time.Second))
	_, msg, e := b.ReadMessage()
	if e != nil || string(msg) != `{"type":"hello"}` {
		t.Fatalf("repasse: %s %v", msg, e)
	}
	c.SetReadDeadline(time.Now().Add(50 * time.Millisecond))
	if _, _, e = c.ReadMessage(); e == nil {
		t.Fatal("mensagem vazou para outra sala")
	}
}

func TestSocketIdentityAndPrivateReplies(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(wsHandler))
	defer server.Close()
	dial := func() *websocket.Conn {
		c, _, e := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http")+"?sala=7777", nil)
		if e != nil {
			t.Fatal(e)
		}
		t.Cleanup(func() { c.Close() })
		return c
	}
	read := func(c *websocket.Conn) map[string]any {
		c.SetReadDeadline(time.Now().Add(time.Second))
		var m map[string]any
		if e := c.ReadJSON(&m); e != nil {
			t.Fatal(e)
		}
		return m
	}
	a, b := dial(), dial()
	a.WriteJSON(map[string]any{"type": "hello", "from": "a", "role": "controller"})
	read(b)
	b.WriteJSON(map[string]any{"type": "hello", "from": "b", "role": "monitor"})
	read(a)
	for _, bad := range []map[string]any{{"type": "cmd", "from": "b", "role": "controller"}, {"type": "state", "from": "a", "role": "controller"}, {"type": "peer-left", "from": "a", "role": "controller"}} {
		a.WriteJSON(bad)
		a.WriteJSON(map[string]any{"type": "ping", "from": "a", "role": "controller"})
		if got := read(b); got["type"] != "ping" {
			t.Fatalf("spoofed message forwarded: %v", got)
		}
	}
	duplicate := dial()
	duplicate.WriteJSON(map[string]any{"type": "hello", "from": "a", "role": "controller"})
	duplicate.SetReadDeadline(time.Now().Add(time.Second))
	if _, _, e := duplicate.ReadMessage(); e == nil {
		t.Fatal("duplicate identity admitted")
	} else if n, ok := e.(interface{ Timeout() bool }); ok && n.Timeout() {
		t.Fatal("duplicate identity not disconnected")
	}
	spy := dial()
	b.WriteJSON(map[string]any{"type": "ack", "from": "b", "role": "monitor", "to": "a"})
	if read(a)["type"] != "ack" {
		t.Fatal("missing private ACK")
	}
	spy.SetReadDeadline(time.Now().Add(50 * time.Millisecond))
	if _, _, e := spy.ReadMessage(); e == nil {
		t.Fatal("private ACK leaked")
	}
	a.Close()
	if got := read(b); got["type"] != "peer-left" || got["peer"] != "a" {
		t.Fatalf("missing disconnect revocation: %v", got)
	}
}

// Wi-Fi caiu sem fechar a conexão: o aparelho volta com a mesma identidade
// enquanto o servidor ainda segura a conexão antiga, calada. A nova precisa
// entrar na hora (antes esperava até 70 s), e a saída da antiga não pode
// avisar a sala — senão o monitor retiraria a autorização do aparelho que
// acabou de voltar.
func TestStaleIdentityIsReplaced(t *testing.T) {
	antes := staleAfter
	staleAfter = 80 * time.Millisecond
	defer func() { staleAfter = antes }()

	server := httptest.NewServer(http.HandlerFunc(wsHandler))
	defer server.Close()
	dial := func() *websocket.Conn {
		c, _, e := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http")+"?sala=8888", nil)
		if e != nil {
			t.Fatal(e)
		}
		t.Cleanup(func() { c.Close() })
		return c
	}
	monitor, velho := dial(), dial()
	monitor.WriteJSON(map[string]any{"type": "hello", "from": "m", "role": "monitor"})
	velho.WriteJSON(map[string]any{"type": "hello", "from": "c", "role": "controller"})
	monitor.SetReadDeadline(time.Now().Add(time.Second))
	var m map[string]any
	if e := monitor.ReadJSON(&m); e != nil || m["from"] != "c" {
		t.Fatalf("monitor não recebeu o hello do controle: %v %v", m, e)
	}

	time.Sleep(150 * time.Millisecond) // a conexão antiga fica calada além do limite

	novo := dial()
	novo.WriteJSON(map[string]any{"type": "hello", "from": "c", "role": "controller"})
	novo.WriteJSON(map[string]any{"type": "ping", "from": "c", "role": "controller"})

	// O monitor recebe as mensagens da conexão nova e nenhum aviso de saída.
	for _, esperado := range []string{"hello", "ping"} {
		monitor.SetReadDeadline(time.Now().Add(time.Second))
		m = nil
		if e := monitor.ReadJSON(&m); e != nil {
			t.Fatalf("conexão nova não entrou: %v", e)
		}
		if m["type"] == "peer-left" {
			t.Fatal("a conexão substituída avisou saída e derrubaria a autorização")
		}
		if m["type"] != esperado {
			t.Fatalf("esperava %s, veio %v", esperado, m)
		}
	}
	monitor.SetReadDeadline(time.Now().Add(150 * time.Millisecond))
	if e := monitor.ReadJSON(&m); e == nil && m["type"] == "peer-left" {
		t.Fatal("a conexão substituída avisou saída depois")
	}

	// A conexão antiga foi fechada pelo servidor. Ela pode ter mensagens de
	// antes na fila (o hello do monitor); lê até chegar ao fechamento.
	velho.SetReadDeadline(time.Now().Add(time.Second))
	for {
		_, _, e := velho.ReadMessage()
		if e == nil {
			continue
		}
		if n, ok := e.(interface{ Timeout() bool }); ok && n.Timeout() {
			t.Fatal("conexão antiga não foi fechada")
		}
		break
	}

	// Mas uma terceira com a mesma identidade, com a nova ainda ativa, é recusada.
	// A nova fala agora: no teste o limite é de só 80 ms, e as esperas acima já
	// passaram disso.
	novo.WriteJSON(map[string]any{"type": "ping", "from": "c", "role": "controller"})
	time.Sleep(10 * time.Millisecond)
	intrusa := dial()
	intrusa.WriteJSON(map[string]any{"type": "hello", "from": "c", "role": "controller"})
	intrusa.SetReadDeadline(time.Now().Add(time.Second))
	if _, _, e := intrusa.ReadMessage(); e == nil {
		t.Fatal("identidade duplicada admitida com a original ativa")
	} else if n, ok := e.(interface{ Timeout() bool }); ok && n.Timeout() {
		t.Fatal("identidade duplicada não foi desconectada")
	}
}

func TestLANBeforeVPN(t *testing.T) {
	wifi := addressPriority("Wi-Fi", net.ParseIP("172.20.32.33"))
	for _, vpn := range []struct{ name, address string }{
		{"Radmin VPN", "26.16.201.242"}, {"WireGuard", "10.0.0.1"}, {"Tailscale", "100.64.0.1"},
	} {
		if wifi >= addressPriority(vpn.name, net.ParseIP(vpn.address)) {
			t.Fatalf("VPN preferred over Wi-Fi: %s", vpn.name)
		}
	}
	for _, address := range []string{"172.16.0.1", "172.31.255.254", "192.168.1.2", "10.1.2.3"} {
		if addressPriority("Wi-Fi", net.ParseIP(address)) != 0 {
			t.Fatalf("private address not preferred: %s", address)
		}
	}
	if addressPriority("Ethernet", net.ParseIP("172.32.0.1")) != 2 {
		t.Fatal("public address classified as private")
	}
}
