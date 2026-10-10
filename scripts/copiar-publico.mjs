// Copia public/ para uma pasta de saída. Usado pela build do site (web/dist,
// publicada pela Vercel) e pelo preparo do executável local (server-go/public).
//
// O destino é apagado antes da cópia. Sem isso, um arquivo removido de public/
// continuaria indo no executável para sempre, porque a cópia só acrescenta.
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Ferramentas de conferência que ficam fora do que é publicado.
// tracados.html (~5,6 MB) é a galeria de comparação dos traçados.
export const FORA_DA_PUBLICACAO = ['tracados.html'];

export const ORIGEM = fileURLToPath(new URL('../public/', import.meta.url));

export function copiarPublico(destino, origem = ORIGEM) {
  rmSync(destino, { recursive: true, force: true });
  cpSync(origem, destino, {
    recursive: true,
    filter: src => !FORA_DA_PUBLICACAO.some(nome => src.endsWith(nome)),
  });
}
