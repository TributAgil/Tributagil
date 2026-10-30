// src/components/ModalGerarPeca.jsx
//
// Fluxo de "Gerar peça (Word)": (1) garante o cadastro do escritório (abre o
// formulário na primeira vez); (2) uma chamada a /api/gerar-peca devolve
// UMA PEÇA POR TESE (prescrição, decadência, intercorrente), cada uma com resumo +
// arquivo; (3) o usuário vê o resumo de cada peça disponível (modelo, CDAs/períodos,
// quantos campos [PREENCHER], avisos e o aviso fixo de revisão) e ESCOLHE qual baixar —
// os modelos nunca são combinados. Peça bloqueada pelo motor ou sem modelo mostra o motivo.
// Antes de baixar, o advogado pode (4) revisar a peça (EditorPeca): editar o texto por tópicos, no navegador e sem IA, e
// montar cada figura no lugar dela no texto. O download usa sempre a versão revisada, quando houver.
// (5) A peça fica SALVA no banco (src/lib/pecasSalvas.js): ao gerar, o original é gravado (substituindo a peça
// anterior da análise) e cada "Aplicar à peça" vira uma versão (ficam as 3 últimas). Reabrir o modal traz a peça
// salva, com as edições e as figuras, sem chamar o Gemini; "Gerar de novo" substitui e apaga a anterior.

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { X, Loader2, FileType2, AlertTriangle, CheckCircle2, Building2, Download, PenLine, RefreshCw, Cloud } from 'lucide-react';
import { lerEscritorio } from '../lib/escritorio';
import { gerarPeca, baixarArquivo } from '../lib/peca';
import { lerPerfilPeca, salvarPerfilPeca, perfilPecaVazio, CAMPOS_CLIENTE } from '../lib/perfilPeca';
import { carregarPecasSalvas, salvarPecasGeradas, salvarVersao, salvarLocalizacao } from '../lib/pecasSalvas';
import ModalEscritorio from './ModalEscritorio';
// o editor (com o leitor de PDF das figuras) só é baixado quando o advogado o abre
const EditorPeca = lazy(() => import('./EditorPeca'));

const dataHora = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
};

/** Peças lidas do banco → o mesmo formato da resposta de /api/gerar-peca (só as disponíveis ficam salvas). */
function resultadoDasSalvas(salvas) {
  return {
    status: 'ok',
    pecas: salvas.map((s) => ({
      tese: s.tese, tese_nome: s.tese_nome, status: 'ok', template: s.template, resumo: s.resumo, figuras: s.figuras, arquivo: s.arquivo,
      mensagem: '', bloqueios: [], divergencias: [], avisos: [],
    })),
  };
}

const Lista = ({ itens, cor }) =>
  itens?.length ? (
    <ul className={`text-xs space-y-1 list-disc pl-4 ${cor}`}>
      {itens.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  ) : null;

export default function ModalGerarPeca({ analise, user, onFechar }) {
  // 'cadastro' | 'pronto' | 'gerando' | 'resultado' | 'erro'
  const [fase, setFase] = useState('carregando');
  const [escritorio, setEscritorio] = useState(null);
  const [editando, setEditando] = useState(false);
  const [incluirBloco, setIncluirBloco] = useState(true);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');
  // peça em revisão (abre o EditorPeca por cima do modal)
  const [pecaEmEdicao, setPecaEmEdicao] = useState(null);
  // por tese: { estado, arquivo, total, contagem, figuras, figurasNoWord, figurasConfirmadas } — o arquivo revisado
  // substitui o original no download; `figuras` guarda a busca (custo de IA) e os recortes para reabrir sem refazer
  const [edicoes, setEdicoes] = useState({});
  const [buscasDeFiguras, setBuscasDeFiguras] = useState({}); // por tese: { localizacao } da última busca
  // peça salva no banco, por tese: { id, versao, atualizadaEm }; e o estado da gravação ('salvando' | 'salvo' | 'erro')
  const [salvas, setSalvas] = useState({});
  const [gravacao, setGravacao] = useState({});
  const [daBase, setDaBase] = useState(false); // o resultado na tela veio do banco (não de uma geração agora)
  const [avisoGeracao, setAvisoGeracao] = useState('');
  // últimos dados usados (Doc. do mandato + qualificação do cliente), editáveis antes de gerar
  const [perfil, setPerfil] = useState(perfilPecaVazio);

  useEffect(() => {
    let vivo = true;
    Promise.all([lerEscritorio(user?.id), carregarPecasSalvas(analise?.id)]).then(async ([e, guardadas]) => {
      if (!vivo) return;
      setEscritorio(e);
      if (guardadas.length === 0) {
        setFase(e ? 'pronto' : 'cadastro'); // primeira vez, sem cadastro: abre o formulário
        return;
      }
      // peça salva: monta a versão revisada (texto + figuras da última versão) aqui mesmo, sem IA; o leitor de Word só é
      // baixado quando há peça salva para remontar
      const edicoesSalvas = {};
      const { montarPecaRevisada } = guardadas.some((g) => g.ultima) ? await import('../lib/pecaRevisada') : {};
      for (const g of guardadas) {
        if (!g.ultima) continue;
        try {
          const revisada = await montarPecaRevisada({ arquivo: g.arquivo, estado: g.ultima.estado, imagens: g.ultima.imagens, figuras: g.figuras });
          edicoesSalvas[g.tese] = { ...revisada, estado: g.ultima.estado, figuras: { localizacao: g.localizacao, imagens: g.ultima.imagens } };
        } catch (err) {
          console.warn('[peca] Falha ao remontar a versão salva:', err);
        }
      }
      if (!vivo) return;
      setResultado(resultadoDasSalvas(guardadas));
      setEdicoes(edicoesSalvas);
      setBuscasDeFiguras(Object.fromEntries(guardadas.filter((g) => g.localizacao).map((g) => [g.tese, { localizacao: g.localizacao }])));
      setSalvas(Object.fromEntries(guardadas.map((g) => [g.tese, { id: g.id, versao: g.versao, atualizadaEm: g.atualizadaEm }])));
      setGravacao(Object.fromEntries(guardadas.map((g) => [g.tese, 'salvo'])));
      setDaBase(true);
      setFase('resultado');
    });
    lerPerfilPeca({ userId: user?.id, analiseId: analise?.id }).then((p) => vivo && setPerfil(p));
    return () => {
      vivo = false;
    };
  }, [user?.id, analise?.id]);

  const gerar = async () => {
    setFase('gerando');
    setErro('');
    const r = await gerarPeca({ analiseId: analise.id, incluirBlocoDecretoLei: incluirBloco, dadosPeca: perfil });
    if (!r.ok) {
      setErro(r.error);
      setFase('erro');
      return;
    }
    const novas = (r.pecas || []).filter((p) => p.status === 'ok');
    const tinhaSalva = Object.keys(salvas).length > 0;
    setResultado(r);
    setDaBase(false);
    setAvisoGeracao('');
    setEdicoes({}); // peça nova: as alterações eram sobre a anterior
    setBuscasDeFiguras({});
    setFase('resultado');
    if (novas.length > 0) {
      // grava a peça nova no lugar da anterior (a anterior, com as edições e figuras dela, some de vez)
      setSalvas({});
      setGravacao(Object.fromEntries(novas.map((p) => [p.tese, 'salvando'])));
      salvarPecasGeradas({ userId: user?.id, analiseId: analise.id, pecas: novas }).then(({ salvas: gravadas }) => {
        setSalvas(gravadas);
        setGravacao(Object.fromEntries(novas.map((p) => [p.tese, gravadas[p.tese] ? 'salvo' : 'erro'])));
      });
    } else if (tinhaSalva) {
      setAvisoGeracao('A nova geração não trouxe peça disponível; a peça salva anteriormente foi mantida e volta na próxima vez que você abrir.');
    }
    // os dados que entraram na peça viram os "últimos utilizados" (próxima peça já vem preenchida)
    if (r.status === 'ok' && r.dados_peca_usados) {
      salvarPerfilPeca({ userId: user?.id, analiseId: analise.id, usados: r.dados_peca_usados }).then((ok) => {
        if (ok) setPerfil(r.dados_peca_usados);
      });
    }
  };

  if (fase === 'cadastro' || editando) {
    return (
      <ModalEscritorio
        user={user}
        inicial={escritorio}
        onFechar={() => (escritorio ? setEditando(false) : onFechar())}
        onSalvo={(e) => {
          setEscritorio(e);
          setEditando(false);
          setFase('pronto');
        }}
      />
    );
  }

  const arquivoDa = (p) => edicoes[p.tese]?.arquivo || p.arquivo;
  // só pergunta ao fechar se há revisão que NÃO ficou salva no banco (gravação falhou ou ainda em andamento)
  const fecharModal = () => {
    const pendente = Object.entries(edicoes).some(
      ([tese, e]) => (e.total > 0 || e.figurasConfirmadas > 0) && gravacao[tese] !== 'salvo',
    );
    if (pendente && !window.confirm('Há revisão da peça que ainda não foi salva no sistema. Fechar mesmo assim?')) return;
    onFechar();
  };

  const gerarDeNovo = () => {
    const temRevisao = Object.keys(salvas).length > 0;
    if (temRevisao && !window.confirm('Gerar de novo substitui a peça salva desta análise e apaga, de vez, as edições e as figuras dela. Continuar?')) return;
    setFase(escritorio ? 'pronto' : 'cadastro');
  };

  /** "Aplicar à peça" do editor: guarda na tela e grava uma versão no banco (ficam as 3 últimas). */
  const aplicarRevisao = (tese, e) => {
    setEdicoes((atual) => {
      const { [tese]: _anterior, ...resto } = atual;
      return e.total > 0 || e.figurasConfirmadas > 0 ? { ...resto, [tese]: e } : resto;
    });
    if (e.figuras?.localizacao) setBuscasDeFiguras((b) => ({ ...b, [tese]: { localizacao: e.figuras.localizacao } }));
    const salva = salvas[tese];
    if (!salva) return;
    setGravacao((g) => ({ ...g, [tese]: 'salvando' }));
    salvarVersao({
      userId: user?.id,
      analiseId: analise.id,
      pecaId: salva.id,
      estado: e.estado,
      total: e.total,
      imagens: e.figuras?.imagens || {},
      figurasConfirmadas: e.figurasConfirmadas,
      localizacao: e.figuras?.localizacao,
    }).then((r) => {
      setGravacao((g) => ({ ...g, [tese]: r.ok ? 'salvo' : 'erro' }));
      if (!r.ok) return;
      setSalvas((s) => ({ ...s, [tese]: { ...s[tese], versao: r.versao, atualizadaEm: new Date().toISOString() } }));
      // as imagens agora têm caminho no bucket: a próxima versão reaproveita, sem subir de novo
      setEdicoes((atual) => (atual[tese] ? { ...atual, [tese]: { ...atual[tese], figuras: { ...atual[tese].figuras, imagens: r.imagens } } } : atual));
    });
  };

  const linhaGravacao = (tese) => {
    const estado = gravacao[tese];
    if (!estado) return null;
    if (estado === 'salvando')
      return (
        <p className="text-[11px] text-parchment/50 flex items-center gap-1.5">
          <Loader2 size={11} className="animate-spin" /> Salvando no sistema…
        </p>
      );
    if (estado === 'erro')
      return (
        <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
          <AlertTriangle size={11} /> Não foi possível salvar no sistema agora. A peça continua disponível enquanto esta janela estiver aberta.
        </p>
      );
    const s = salvas[tese];
    return (
      <p className="text-[11px] text-emerald-400/90 flex items-center gap-1.5">
        <Cloud size={11} /> Salva no sistema{s?.versao ? ` · revisão ${s.versao}` : ''}
        {s?.atualizadaEm ? ` · ${dataHora(s.atualizadaEm)}` : ''}
      </p>
    );
  };

  // depois de editar, a contagem do que falta vem do texto editado (a do servidor é da peça original)
  const pendenciasDa = (p) =>
    edicoes[p.tese]?.contagem || { preencher: p.resumo.campos_preencher, confirmar: p.resumo.a_confirmar, figuras: p.resumo.figuras };

  const r = resultado;
  const disponiveis = (r?.pecas || []).filter((p) => p.status === 'ok');
  const indisponiveis = (r?.pecas || []).filter((p) => p.status !== 'ok');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={fase === 'gerando' ? undefined : fecharModal} />
      <div className="relative bg-ink-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto border border-line">
        {fase !== 'gerando' && (
          <button onClick={fecharModal} className="absolute right-4 top-4 text-parchment/40 hover:text-parchment transition-colors" aria-label="Fechar">
            <X size={18} />
          </button>
        )}

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-gold/15 flex items-center justify-center">
            <FileType2 size={22} className="text-gold" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-parchment">Gerar peça (Word)</h3>
            <p className="text-xs text-parchment/50">Minuta editável, montada a partir dos documentos desta análise.</p>
          </div>
        </div>

        {fase === 'carregando' && (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin text-gold" />
          </div>
        )}

        {fase === 'pronto' && (
          <div className="space-y-4">
            <p className="text-sm text-parchment/70 leading-relaxed">
              Vamos reler os documentos da análise, calcular os prazos e montar a peça no modelo do escritório. Pode levar cerca de 1 a 2 minutos.
            </p>
            <label className="flex items-start gap-2 text-xs text-parchment/60">
              <input type="checkbox" className="mt-0.5" checked={incluirBloco} onChange={(ev) => setIncluirBloco(ev.target.checked)} />
              <span>Incluir a citação do Decreto 20.910/32 e da Lei 9.873/99 na parte de prescrição (pendente de revisão jurídica — ver observações do modelo).</span>
            </label>
            <div className="rounded-xl bg-ink-900/60 border border-line p-3 space-y-2">
              <p className="text-xs text-parchment/50">Dados desta peça — lembrados da última vez; o que você alterar vale para as próximas.</p>
              <label className="block">
                <span className="block text-xs text-parchment/50 mb-1">Nº do Doc. do mandato</span>
                <input
                  className="w-full rounded-xl bg-ink-900/60 border border-line px-3 py-2 text-sm text-parchment focus:outline-none focus:border-gold/50"
                  value={perfil.doc_mandato}
                  maxLength={30}
                  placeholder="ex.: 01"
                  onChange={(ev) => setPerfil((p) => ({ ...p, doc_mandato: ev.target.value }))}
                />
              </label>
              <details>
                <summary className="text-xs text-gold cursor-pointer">Dados do cliente (opcional — em branco usa o que for lido dos documentos)</summary>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {CAMPOS_CLIENTE.map((c) => (
                    <label key={c.chave} className={c.chave === 'endereco' || c.chave === 'nome' ? 'col-span-2 block' : 'block'}>
                      <span className="block text-xs text-parchment/50 mb-1">{c.rotulo}</span>
                      <input
                        className="w-full rounded-xl bg-ink-900/60 border border-line px-3 py-2 text-sm text-parchment focus:outline-none focus:border-gold/50"
                        value={perfil.cliente[c.chave]}
                        maxLength={c.maxLength}
                        onChange={(ev) => setPerfil((p) => ({ ...p, cliente: { ...p.cliente, [c.chave]: ev.target.value } }))}
                      />
                    </label>
                  ))}
                </div>
              </details>
            </div>
            <button onClick={() => setEditando(true)} className="inline-flex items-center gap-1.5 text-xs text-gold hover:underline">
              <Building2 size={12} /> Editar dados do escritório
            </button>
            <div className="flex gap-3 pt-1">
              <button
                onClick={resultado ? () => setFase('resultado') : onFechar}
                className="flex-1 py-2.5 text-sm font-medium text-parchment/60 bg-ink-700 hover:bg-ink-600 rounded-xl transition-colors"
              >
                {resultado ? 'Voltar à peça salva' : 'Cancelar'}
              </button>
              <button onClick={gerar} className="flex-1 py-2.5 text-sm font-semibold text-ink bg-gold hover:bg-gold/90 rounded-xl shadow-lg shadow-gold/20 transition-all">
                Gerar peça
              </button>
            </div>
          </div>
        )}

        {fase === 'gerando' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader2 size={28} className="animate-spin text-gold" />
            <p className="text-sm text-parchment/70">Lendo os documentos e montando a peça…</p>
            <p className="text-xs text-parchment/40">Não feche esta janela.</p>
          </div>
        )}

        {fase === 'erro' && (
          <div className="space-y-4">
            <p className="text-sm text-red-400 flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span>{erro}</span>
            </p>
            <div className="flex gap-3">
              <button onClick={onFechar} className="flex-1 py-2.5 text-sm text-parchment/60 bg-ink-700 hover:bg-ink-600 rounded-xl">
                Fechar
              </button>
              <button onClick={gerar} className="flex-1 py-2.5 text-sm font-semibold text-ink bg-gold hover:bg-gold/90 rounded-xl">
                Tentar de novo
              </button>
            </div>
          </div>
        )}

        {fase === 'resultado' && r?.status === 'ok' && (
          <div className="space-y-4">
            {daBase && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-parchment/80 space-y-2">
                <p className="flex items-start gap-1.5">
                  <Cloud size={13} className="mt-0.5 shrink-0 text-emerald-400" />
                  <span>Esta é a peça salva desta análise, com a última revisão. Nada foi lido de novo pela IA.</span>
                </p>
                <button onClick={gerarDeNovo} className="inline-flex items-center gap-1.5 text-gold hover:underline">
                  <RefreshCw size={12} /> Gerar de novo (substitui a peça salva)
                </button>
              </div>
            )}
            <p className="text-sm text-parchment/70">
              {disponiveis.length > 1
                ? 'Este caso comporta mais de uma peça. Escolha qual baixar — os modelos não são combinados.'
                : 'Peça pronta para baixar.'}
            </p>

            {disponiveis.map((p) => (
              <div key={p.tese} className="rounded-xl bg-ink-900/60 border border-line p-4 space-y-2 text-sm">
                <p className="text-parchment font-semibold">{p.resumo.modelo}</p>
                <p className="text-xs text-parchment/70">{p.resumo.descricao}</p>
                <div>
                  <p className="text-parchment/50 text-xs mb-1">{p.tese === 'prescricao_intercorrente' ? 'CDAs e datas' : 'CDAs / períodos que entram na peça'}</p>
                  <ul className="text-xs text-parchment/80 space-y-0.5">
                    {p.tese === 'prescricao_intercorrente' && p.resumo.intercorrente ? (
                      <li>
                        ciência da Fazenda em {p.resumo.intercorrente.data_intimacao} → fim da suspensão em {p.resumo.intercorrente.data_fim_suspensao} →
                        prescrição em {p.resumo.intercorrente.data_prazo_final}
                      </li>
                    ) : (
                      p.resumo.creditos.map((c, i) => (
                        <li key={i}>
                          {c.cda} — período {c.periodo}: {c.termo_inicial} → {c.consumacao}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <p className="text-parchment">
                  <span className="text-parchment/50">A preencher no Word: </span>
                  {pendenciasDa(p).preencher} campo(s) <span className="text-parchment/40">+</span> {pendenciasDa(p).figuras} figura(s) a inserir
                  {pendenciasDa(p).confirmar > 0 && (
                    <>
                      {' '}<span className="text-parchment/40">+</span> {pendenciasDa(p).confirmar} trecho(s) a confirmar
                    </>
                  )}
                  <span className="text-parchment/40"> (destacados em amarelo)</span>
                </p>
                {edicoes[p.tese]?.total > 0 && (
                  <p className="text-xs text-gold flex items-center gap-1.5">
                    <PenLine size={12} /> Texto editado: {edicoes[p.tese].total} alteração(ões). O download já sai com elas.
                  </p>
                )}
                {p.figuras?.length > 0 && edicoes[p.tese]?.figurasConfirmadas > 0 && (
                  <p className={`text-xs flex items-center gap-1.5 ${edicoes[p.tese].figurasNoWord ? 'text-emerald-400' : 'text-parchment/60'}`}>
                    <CheckCircle2 size={12} />
                    {edicoes[p.tese].figurasNoWord
                      ? `As ${p.figuras.length} figura(s) já estão no Word.`
                      : `${edicoes[p.tese].figurasConfirmadas} de ${p.figuras.length} figura(s) confirmada(s); entram no Word quando todas estiverem.`}
                  </p>
                )}
                <Lista itens={p.resumo.avisos} cor="text-amber-400" />
                {linhaGravacao(p.tese)}
                <button
                  onClick={() => setPecaEmEdicao(p)}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-gold bg-gold/10 hover:bg-gold/20 border border-gold/30 rounded-xl"
                >
                  <PenLine size={15} />{' '}
                  {edicoes[p.tese]
                    ? 'Continuar a revisão'
                    : p.figuras?.length > 0
                      ? `Revisar o texto e montar as ${p.figuras.length} figura(s)`
                      : 'Revisar o texto da peça'}
                </button>
                <button
                  onClick={() => baixarArquivo(arquivoDa(p))}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-ink bg-gold hover:bg-gold/90 rounded-xl shadow-lg shadow-gold/20"
                >
                  <Download size={15} /> Baixar {p.resumo.tese.toLowerCase()} (.docx)
                </button>
              </div>
            ))}

            {indisponiveis.length > 0 && (
              <div className="rounded-xl border border-line p-3 space-y-2">
                <p className="text-xs text-parchment/50">Outras teses do caso, sem peça disponível agora:</p>
                {indisponiveis.map((p) => (
                  <div key={p.tese} className="text-xs">
                    <p className="text-amber-400">{p.tese_nome}: {p.mensagem}</p>
                    <Lista itens={[...p.bloqueios, ...p.divergencias]} cor="text-parchment/70" />
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-red-300 flex items-start gap-1.5 border border-red-500/30 bg-red-500/10 rounded-lg p-2.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> <span>{disponiveis[0].resumo.aviso_fixo}</span>
            </p>

            <button onClick={fecharModal} className="w-full py-2.5 text-sm text-parchment/60 bg-ink-700 hover:bg-ink-600 rounded-xl">
              Fechar
            </button>
          </div>
        )}

        {fase === 'resultado' && r?.status !== 'ok' && (
          <div className="space-y-3">
            <p className="text-sm text-amber-400 flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{r?.mensagem || 'A peça não pode ser gerada automaticamente.'}</span>
            </p>
            {avisoGeracao && <p className="text-xs text-parchment/60">{avisoGeracao}</p>}
            {(r?.pecas || []).map((p) => (
              <div key={p.tese} className="rounded-xl border border-line p-3 space-y-1.5">
                <p className="text-xs font-semibold text-parchment/90">{p.resumo_curto || p.tese_nome}</p>
                <Lista itens={p.bloqueios_resumo?.length ? p.bloqueios_resumo : p.bloqueios} cor="text-parchment/80" />
                {p.divergencias?.length > 0 && (
                  <>
                    <p className="text-xs text-parchment/50">Divergência com o parecer</p>
                    <Lista itens={p.divergencias} cor="text-parchment/80" />
                  </>
                )}
                {p.orientacao && <p className="text-xs text-gold/90">O que fazer: {p.orientacao}</p>}
                {p.bloqueios?.length > (p.bloqueios_resumo?.length || 0) && (
                  <details>
                    <summary className="text-xs text-parchment/50 cursor-pointer">Ver os {p.bloqueios.length} motivos, um por período</summary>
                    <div className="mt-1.5">
                      <Lista itens={p.bloqueios} cor="text-parchment/60" />
                    </div>
                  </details>
                )}
                <Lista itens={p.avisos} cor="text-parchment/50" />
              </div>
            ))}
            {r?.status === 'bloqueada' && <p className="text-xs text-parchment/50">Este caso exige análise manual do advogado responsável.</p>}
            <button onClick={onFechar} className="w-full py-2.5 text-sm text-parchment/60 bg-ink-700 hover:bg-ink-600 rounded-xl">
              Fechar
            </button>
          </div>
        )}

        {fase === 'resultado' && r?.status === 'ok' && (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-parchment/40">
            <CheckCircle2 size={11} /> Peça montada com sucesso — a revisão profissional continua obrigatória.
          </p>
        )}
      </div>
      {pecaEmEdicao && (
        <Suspense fallback={null}>
          <EditorPeca
            // sempre a peça ORIGINAL + o estado das alterações: reabrir continua de onde parou
            arquivo={pecaEmEdicao.arquivo}
            analiseId={analise.id}
            figuras={pecaEmEdicao.figuras || []}
            estadoInicial={edicoes[pecaEmEdicao.tese]?.estado}
            figurasIniciais={{
              localizacao: edicoes[pecaEmEdicao.tese]?.figuras?.localizacao || buscasDeFiguras[pecaEmEdicao.tese]?.localizacao,
              imagens: edicoes[pecaEmEdicao.tese]?.figuras?.imagens,
            }}
            tituloPeca={pecaEmEdicao.resumo?.modelo}
            resumoPeca={pecaEmEdicao.resumo}
            template={pecaEmEdicao.template}
            onFechar={({ figuras } = {}) => {
              // saiu sem aplicar: guarda só a busca das figuras (não repete a chamada ao Gemini ao reabrir)
              const tese = pecaEmEdicao.tese;
              if (figuras?.localizacao) {
                const nova = !buscasDeFiguras[tese]?.localizacao;
                setBuscasDeFiguras((b) => ({ ...b, [tese]: { localizacao: figuras.localizacao } }));
                if (nova && salvas[tese]) salvarLocalizacao({ pecaId: salvas[tese].id, localizacao: figuras.localizacao });
              }
              setPecaEmEdicao(null);
            }}
            onAplicar={(e) => {
              aplicarRevisao(pecaEmEdicao.tese, e);
              setPecaEmEdicao(null);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
