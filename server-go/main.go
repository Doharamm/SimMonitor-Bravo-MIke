// Bravo Mike SimMonitor - servidor local (modo sem internet)
package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

//go:embed public
var content embed.FS

// Cada cliente tem sua própria fila de escrita. Sem isso, um celular travado
// segurava a sala inteira até o prazo de escrita expirar, a cada mensagem.
type client struct {
	id   string
	role string
	conn *websocket.Conn
	out  chan []byte
	once sync.Once
	dead chan struct{}
}

func (c *client) close() {
	c.once.Do(func() { close(c.dead); c.conn.Close() })
}

// Envia sem bloquear: se a fila do cliente encheu, ele é desconectado e volta sozinho.
func (c *client) push(msg []byte) {
	select {
	case c.out <- msg:
	case <-c.dead:
	default:
		c.close()
	}
}

const (
	maxRooms       = 64
	maxRoomClients = 16
	clientQueue    = 32
	writeWait      = 5 * time.Second
	pongWait       = 70 * time.Second
	pingEvery      = 25 * time.Second
)

// Códigos de sala vêm do monitor (4 dígitos). Qualquer outra coisa é recusada.
func validRoom(s string) bool {
	if len(s) < 3 || len(s) > 6 {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

var (
	rooms   = map[string]map[*client]bool{}
	roomsMu sync.Mutex
	// aceita só páginas servidas por este próprio programa (ou clientes sem Origin)
	up = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool {
		o := r.Header.Get("Origin")
		return o == "" || strings.TrimPrefix(strings.TrimPrefix(o, "http://"), "https://") == r.Host
	}}
	port int
)

// Prefer private LAN addresses; VPN adapters remain available as alternatives.
func addressPriority(interfaceName string, ip net.IP) int {
	score := 2
	if ip.IsPrivate() {
		score = 0
	}
	name := strings.ToLower(interfaceName)
	for _, virtual := range []string{"vbox", "vmware", "virtual", "hyper-v", "vethernet", "wsl", "docker", "tailscale", "zerotier", "bluetooth", "radmin", "vpn", "wireguard", "tunnel", "tap-windows"} {
		if strings.Contains(name, virtual) {
			return score + 10
		}
	}
	return score
}

func lanIPs() []string {
	type cand struct {
		ip    string
		score int
	}
	var list []cand
	ifaces, _ := net.Interfaces()
	for _, ifc := range ifaces {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := ifc.Addrs()
		for _, a := range addrs {
			ipn, ok := a.(*net.IPNet)
			if !ok || ipn.IP.To4() == nil {
				continue
			}
			ip := ipn.IP.String()
			if strings.HasPrefix(ip, "169.254.") {
				continue
			}
			s := addressPriority(ifc.Name, ipn.IP)
			list = append(list, cand{ip, s})
		}
	}
	sort.SliceStable(list, func(i, j int) bool { return list[i].score < list[j].score })
	out := []string{}
	for _, c := range list {
		out = append(out, c.ip)
	}
	return out
}

func wsHandler(w http.ResponseWriter, r *http.Request) {
	sala := r.URL.Query().Get("sala")
	if sala == "" {
		sala = "0000"
	}
	if !validRoom(sala) {
		http.Error(w, "sala invalida", http.StatusBadRequest)
		return
	}
	roomsMu.Lock()
	if _, ok := rooms[sala]; !ok && len(rooms) >= maxRooms {
		roomsMu.Unlock()
		http.Error(w, "muitas salas abertas", http.StatusServiceUnavailable)
		return
	}
	if len(rooms[sala]) >= maxRoomClients {
		roomsMu.Unlock()
		http.Error(w, "sala cheia", http.StatusServiceUnavailable)
		return
	}
	roomsMu.Unlock()

	conn, err := up.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	conn.SetReadLimit(64 * 1024)
	c := &client{conn: conn, out: make(chan []byte, clientQueue), dead: make(chan struct{})}

	roomsMu.Lock()
	// O upgrade ocorre fora da trava. Revalidar antes de admitir evita que
	// clientes simultâneos ultrapassem os limites checados acima.
	_, exists := rooms[sala]
	if (!exists && len(rooms) >= maxRooms) || len(rooms[sala]) >= maxRoomClients {
		roomsMu.Unlock()
		c.close()
		return
	}
	if rooms[sala] == nil {
		rooms[sala] = map[*client]bool{}
	}
	rooms[sala][c] = true
	roomsMu.Unlock()

	defer func() {
		c.close()
		roomsMu.Lock()
		delete(rooms[sala], c)
		if c.id != "" {
			notice, _ := json.Marshal(map[string]string{"type": "peer-left", "peer": c.id, "from": "server"})
			for p := range rooms[sala] {
				p.push(notice)
			}
		}
		// Salas vazias não ficam ocupando memória até o programa fechar.
		if len(rooms[sala]) == 0 {
			delete(rooms, sala)
		}
		roomsMu.Unlock()
	}()

	// Escritor: uma goroutine por cliente, com ping para derrubar conexões mortas.
	go func() {
		ping := time.NewTicker(pingEvery)
		defer ping.Stop()
		for {
			select {
			case msg := <-c.out:
				c.conn.SetWriteDeadline(time.Now().Add(writeWait))
				if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
					c.close()
					return
				}
			case <-ping.C:
				c.conn.SetWriteDeadline(time.Now().Add(writeWait))
				if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					c.close()
					return
				}
			case <-c.dead:
				return
			}
		}
	}()

	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error { return conn.SetReadDeadline(time.Now().Add(pongWait)) })
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			return
		}
		conn.SetReadDeadline(time.Now().Add(pongWait))
		roomsMu.Lock()
		// Bind the first claimed identity to this live socket; later spoofing is rejected.
		var envelope map[string]any
		if json.Unmarshal(msg, &envelope) != nil {
			roomsMu.Unlock()
			continue
		}
		kind, _ := envelope["type"].(string)
		id, _ := envelope["from"].(string)
		role, _ := envelope["role"].(string)
		if id != "" {
			if len(id) > 128 || (role != "controller" && role != "monitor") {
				roomsMu.Unlock()
				continue
			}
			if c.id == "" {
				duplicate := false
				for p := range rooms[sala] {
					if p != c && p.id == id {
						duplicate = true
						break
					}
				}
				if duplicate {
					roomsMu.Unlock()
					c.close()
					return
				}
				c.id = id
				c.role = role
			}
			if c.id != id || c.role != role {
				roomsMu.Unlock()
				continue
			}
		} else if kind != "hello" {
			roomsMu.Unlock()
			continue
		}
		if (kind == "state" || kind == "ack" || kind == "bye") && c.role != "monitor" {
			roomsMu.Unlock()
			continue
		}
		if (kind == "cmd" || kind == "pair-request") && c.role != "controller" {
			roomsMu.Unlock()
			continue
		}
		if kind != "state" && kind != "ack" && kind != "bye" && kind != "cmd" && kind != "pair-request" && kind != "hello" && kind != "ping" {
			roomsMu.Unlock()
			continue
		}
		target, _ := envelope["to"].(string)
		peers := make([]*client, 0, len(rooms[sala]))
		for p := range rooms[sala] {
			if p != c && (target == "" || p.id == target) {
				peers = append(peers, p)
			}
		}
		roomsMu.Unlock()
		for _, p := range peers {
			p.push(msg)
		}
	}
}

func openBrowser(url string) {
	switch runtime.GOOS {
	case "windows":
		exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		exec.Command("open", url).Start()
	}
}

func main() {
	sub, _ := fs.Sub(content, "public")
	files := http.FileServer(http.FS(sub))
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", wsHandler)
	mux.HandleFunc("/api/info", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		json.NewEncoder(w).Encode(map[string]any{"local": true, "ips": lanIPs(), "port": port, "version": "2.3.3-online.20260921", "security": "socket-identity-v1"})
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		// tipos definidos aqui porque o registro do Windows pode informar tipos errados (ex.: .js como text/plain)
		mimes := map[string]string{".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json"}
		path := r.URL.Path
		if path == "/" || strings.HasSuffix(path, "/") {
			path += "index.html"
		}
		if i := strings.LastIndex(path, "."); i >= 0 {
			if m, ok := mimes[path[i:]]; ok {
				w.Header().Set("Content-Type", m)
			}
		}
		files.ServeHTTP(w, r)
	})

	var ln net.Listener
	var err error
	for p := 8787; p < 8807; p++ {
		ln, err = net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", p))
		if err == nil {
			port = p
			break
		}
	}
	if ln == nil {
		fmt.Println("Nao foi possivel abrir uma porta:", err)
		fmt.Scanln()
		os.Exit(1)
	}
	ips := lanIPs()
	local := fmt.Sprintf("http://localhost:%d/monitor.html", port)
	fmt.Println()
	fmt.Println("  ==============================================")
	fmt.Println("   BRAVO MIKE SimMonitor - modo local (Wi-Fi)")
	fmt.Println("  ==============================================")
	fmt.Println()
	fmt.Println("   Monitor neste computador:  " + local)
	if len(ips) > 0 {
		fmt.Printf("   Monitor em outro aparelho: http://%s:%d/monitor.html\n", ips[0], port)
		fmt.Printf("   Controle no celular:       http://%s:%d/controle.html\n", ips[0], port)
		if len(ips) > 1 {
			fmt.Println("   Outros enderecos: " + strings.Join(ips[1:], ", "))
		}
	} else {
		fmt.Println("   Nenhuma rede encontrada. Conecte o computador a um Wi-Fi.")
	}
	fmt.Println()
	fmt.Println("   Deixe esta janela aberta durante a aula.")
	fmt.Println("   Para encerrar, feche a janela.")
	fmt.Println()
	if os.Getenv("NO_BROWSER") == "" {
		openBrowser(local)
	}
	http.Serve(ln, mux)
}
