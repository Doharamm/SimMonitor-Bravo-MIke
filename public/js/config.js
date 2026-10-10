// Configuração do modo online: projeto Supabase usado pelo canal privado da sala
// (Realtime) e pelas tabelas de salas e participantes (supabase/migrations/).
// A chave publicável é feita para uso no navegador; ela identifica o projeto,
// não autentica o instrutor. Quem autoriza são as políticas do banco.
export const CONFIG = {
  supabaseUrl: 'https://vonehbabrbjbjfxnsmpj.supabase.co',
  supabaseKey: 'sb_publishable_LOxS8a6PH_rVENRC8N29Wg_CPiFo09L',
};
