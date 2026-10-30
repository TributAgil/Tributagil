// tests/supabase-falso.js
//
// Supabase FALSO, em memória, para testar src/lib/pecasSalvas.js (e a tela da peça) sem rede nem banco de verdade.
// Imita só o pedaço do supabase-js que o app usa: from(tabela) com select/insert/update/delete, eq/in/order,
// single/maybeSingle; storage.from(bucket) com upload/list/remove/download; rpc('salvar_versao_peca') com a mesma
// regra do SQL (numera e mantém as 3 últimas); auth.getSession(). Sem RLS: o isolamento entre usuários é testado no
// SQL (Postgres local) e em scripts/teste-rls-isolamento.mjs.

export function criarSupabaseFalso({ userId = 'usuario-a', tabelas = {}, falhas = {} } = {}) {
  const db = { pecas: [], pecas_versoes: [], escritorios: [], analises: [], casos: [], ...tabelas };
  const arquivos = new Map(); // `${bucket}/${caminho}` -> Blob
  const chamadas = [];

  const falha = (chave) => (falhas[chave] ? { message: `falha simulada: ${chave}` } : null);

  function consulta(tabela) {
    const estado = { op: 'select', filtros: [], ordem: null, valores: null, retorno: false, unico: null };
    const linhas = () => (db[tabela] ||= []);
    const passa = (l) => estado.filtros.every(([col, op, v]) => (op === 'eq' ? l[col] === v : v.includes(l[col])));
    const executar = () => {
      const erro = falha(`${tabela}.${estado.op}`);
      if (erro) return { data: null, error: erro };
      let resultado;
      if (estado.op === 'insert') {
        const novas = (Array.isArray(estado.valores) ? estado.valores : [estado.valores]).map((v) => ({
          versao_atual: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...v,
        }));
        if (tabela === 'pecas') {
          for (const n of novas) {
            if (linhas().some((l) => l.analise_id === n.analise_id && l.tese === n.tese)) {
              return { data: null, error: { message: 'duplicate key value violates unique constraint "pecas_analise_tese_unq"' } };
            }
          }
        }
        linhas().push(...novas);
        resultado = novas;
      } else if (estado.op === 'update') {
        resultado = linhas().filter(passa);
        for (const l of resultado) Object.assign(l, estado.valores, { updated_at: new Date().toISOString() });
      } else if (estado.op === 'delete') {
        resultado = linhas().filter(passa);
        db[tabela] = linhas().filter((l) => !passa(l));
        if (tabela === 'pecas') {
          const ids = new Set(resultado.map((p) => p.id));
          db.pecas_versoes = db.pecas_versoes.filter((v) => !ids.has(v.peca_id)); // on delete cascade
        }
      } else {
        resultado = linhas().filter(passa);
      }
      if (estado.ordem) {
        const [col, asc] = estado.ordem;
        resultado = [...resultado].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
      }
      resultado = resultado.map((l) => structuredClone(l));
      if (estado.unico === 'single') return resultado.length === 1 ? { data: resultado[0], error: null } : { data: null, error: { message: 'não é 1 linha' } };
      if (estado.unico === 'maybe') return { data: resultado[0] || null, error: null };
      return { data: estado.op === 'select' || estado.retorno ? resultado : null, error: null };
    };
    const q = {
      select() {
        if (estado.op !== 'select') estado.retorno = true;
        return q;
      },
      insert(v) {
        estado.op = 'insert';
        estado.valores = v;
        return q;
      },
      update(v) {
        estado.op = 'update';
        estado.valores = v;
        return q;
      },
      delete() {
        estado.op = 'delete';
        return q;
      },
      upsert(v) {
        estado.op = 'insert';
        estado.valores = v;
        return q;
      },
      eq(col, v) {
        estado.filtros.push([col, 'eq', v]);
        return q;
      },
      in(col, v) {
        estado.filtros.push([col, 'in', v]);
        return q;
      },
      order(col, { ascending = true } = {}) {
        estado.ordem = [col, ascending];
        return q;
      },
      limit() {
        return q;
      },
      single() {
        estado.unico = 'single';
        return q;
      },
      maybeSingle() {
        estado.unico = 'maybe';
        return q;
      },
      then(ok, erro) {
        return Promise.resolve().then(executar).then(ok, erro);
      },
    };
    return q;
  }

  const paraBlob = (corpo, tipo) => (corpo instanceof Blob ? corpo : new Blob([corpo], { type: tipo || '' }));

  const storage = {
    from(bucket) {
      return {
        async upload(caminho, corpo, { contentType, upsert = false } = {}) {
          chamadas.push(['upload', bucket, caminho]);
          const erro = falha(`storage.upload`);
          if (erro) return { data: null, error: erro };
          if (!caminho.startsWith(`${userId}/`)) return { data: null, error: { message: 'new row violates row-level security policy' } };
          if (!upsert && arquivos.has(`${bucket}/${caminho}`)) return { data: null, error: { message: 'The resource already exists' } };
          arquivos.set(`${bucket}/${caminho}`, paraBlob(corpo, contentType));
          return { data: { path: caminho }, error: null };
        },
        async list(prefixo, { limit = 100, offset = 0 } = {}) {
          const base = `${bucket}/${prefixo}/`;
          const nomes = new Map();
          for (const chave of arquivos.keys()) {
            if (!chave.startsWith(base)) continue;
            const resto = chave.slice(base.length);
            const [primeiro, ...mais] = resto.split('/');
            nomes.set(primeiro, mais.length ? null : chave);
          }
          const itens = [...nomes.entries()].sort().map(([name, chave]) => ({ name, id: chave ? `id-${name}` : null }));
          return { data: itens.slice(offset, offset + limit), error: null };
        },
        async remove(caminhos) {
          chamadas.push(['remove', bucket, ...caminhos]);
          for (const c of caminhos) arquivos.delete(`${bucket}/${c}`);
          return { data: [], error: null };
        },
        async download(caminho) {
          const blob = arquivos.get(`${bucket}/${caminho}`);
          return blob ? { data: blob, error: null } : { data: null, error: { message: 'Object not found' } };
        },
      };
    },
  };

  async function rpc(nome, p) {
    chamadas.push(['rpc', nome]);
    if (nome !== 'salvar_versao_peca') return { data: null, error: { message: `rpc desconhecida: ${nome}` } };
    const erro = falha('rpc');
    if (erro) return { data: null, error: erro };
    const peca = db.pecas.find((x) => x.id === p.p_peca_id && x.user_id === userId);
    if (!peca) return { data: null, error: { message: 'PECA_NAO_ENCONTRADA' } };
    const numero = Math.max(0, ...db.pecas_versoes.filter((v) => v.peca_id === peca.id).map((v) => v.numero)) + 1;
    db.pecas_versoes.push({
      peca_id: peca.id,
      user_id: userId,
      numero,
      alteracoes: structuredClone(p.p_alteracoes),
      imagens: structuredClone(p.p_imagens),
      total_alteracoes: p.p_total_alteracoes,
      figuras_confirmadas: p.p_figuras_confirmadas,
      criada_em: new Date().toISOString(),
    });
    db.pecas_versoes = db.pecas_versoes.filter((v) => v.peca_id !== peca.id || v.numero > numero - 3);
    peca.versao_atual = numero;
    return { data: numero, error: null };
  }

  const supabase = {
    from: consulta,
    storage,
    rpc,
    auth: {
      async getSession() {
        return { data: { session: { user: { id: userId }, access_token: 'token-falso' } } };
      },
    },
  };
  return { supabase, db, arquivos, chamadas };
}
