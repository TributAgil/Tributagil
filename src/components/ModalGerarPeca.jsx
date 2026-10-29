// src/components/ModalGerarPeca.jsx
//
// Fluxo de "Gerar peça (Word)": (1) garante o cadastro do escritório (abre o
// formulário na primeira vez); (2) uma chamada a /api/gerar-peca devolve
// UMA PEÇA POR TESE (prescrição, decadência, intercorrente), cada uma com resumo +
// arquivo; (3) o usuário vê o resumo de cada peça disponível (modelo, CDAs/períodos,
// quantos campos [PREENCHER], avisos e o aviso fixo de revisão) e ESCOLHE qual baixar —
// os modelos nunca são combinados. Peça bloqueada pelo motor ou sem modelo mostra o motivo.
// Antes de baixar, o advogado pode (4) editar o texto por tópicos (EditorPeca, no navegador, sem IA) e (5) montar as
// figuras; o download e as figuras usam sempre a versão editada, quando houver.

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { X, Loader2, FileType2, AlertTriangle, CheckCircle2, Building2, Download, Images, PenLine } from 'lucide-react';
import { lerEscritorio } from '../lib/escritorio';
import { gerarPeca, baixarArquivo } from '../lib/peca';
import { lerPerfilPeca, salvarPerfilPeca, perfilPecaVazio, CAMPOS_CLIENTE } from '../lib/perfilPeca';
import ModalEscritorio from './ModalEscritorio';
// a tela de figuras (e o leitor de PDF dela) só é baixada quando o advogado a abre
const PainelFiguras = lazy(() => import('./PainelFiguras'));
const EditorPeca = lazy(() => import('./EditorPeca'));

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
  // peça cujas figuras estão sendo montadas (abre o PainelFiguras por cima do modal)
  const [pecaDasFiguras, setPecaDasFiguras] = useState(null);
  // peça cujo texto está sendo editado (abre o EditorPeca por cima do modal)
  const [pecaEmEdicao, setPecaEmEdicao] = useState(null);
  // por tese: { estado, arquivo, total, contagem } — o arquivo editado substitui o original no download e nas figuras
  const [edicoes, setEdicoes] = useState({});
  // últimos dados usados (Doc. do mandato + qualificação do cliente), editáveis antes de gerar
  const [perfil, setPerfil] = useState(perfilPecaVazio);

  useEffect(() => {
    let vivo = true;
    lerEscritorio(user?.id).then((e) => {
      if (!vivo) return;
      setEscritorio(e);
      setFase(e ? 'pronto' : 'cadastro'); // primeira vez, sem cadastro: abre o formulário
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
    setResultado(r);
    setEdicoes({}); // peça nova: as alterações eram sobre a anterior
    setFase('resultado');
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
  const fecharModal = () => {
    const editadas = Object.values(edicoes).some((e) => e.total > 0);
    if (editadas && !window.confirm('As alterações feitas no texto da peça não ficam salvas depois de fechar. Fechar mesmo assim?')) return;
    onFechar();
  };

  // depois de editar, a contagem do que falta vem do texto editado (a do servidor é da peça original)
  const pendenciasDa = (p) =>
    edicoes[p.tese]?.contagem || { preencher: p.resumo.campos_preencher, confirmar: p.resumo.a_confirmar };

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
              <button onClick={onFechar} className="flex-1 py-2.5 text-sm font-medium text-parchment/60 bg-ink-700 hover:bg-ink-600 rounded-xl transition-colors">
                Cancelar
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
                  {pendenciasDa(p).preencher} campo(s) <span className="text-parchment/40">+</span> {p.resumo.figuras} figura(s) a inserir
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
                <Lista itens={p.resumo.avisos} cor="text-amber-400" />
                <button
                  onClick={() => setPecaEmEdicao(p)}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-parchment bg-ink-700 hover:bg-ink-600 border border-line rounded-xl"
                >
                  <PenLine size={15} /> {edicoes[p.tese]?.total > 0 ? 'Continuar editando o texto' : 'Editar o texto da peça'}
                </button>
                {p.figuras?.length > 0 && (
                  <button
                    onClick={() => setPecaDasFiguras(p)}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-gold bg-gold/10 hover:bg-gold/20 border border-gold/30 rounded-xl"
                  >
                    <Images size={15} /> Montar as {p.figuras.length} figura(s) antes de baixar
                  </button>
                )}
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
      {pecaDasFiguras && (
        <Suspense fallback={null}>
          <PainelFiguras
            analiseId={analise.id}
            figuras={pecaDasFiguras.figuras}
            arquivo={arquivoDa(pecaDasFiguras)}
            tituloPeca={pecaDasFiguras.resumo?.modelo}
            onFechar={() => setPecaDasFiguras(null)}
          />
        </Suspense>
      )}
      {pecaEmEdicao && (
        <Suspense fallback={null}>
          <EditorPeca
            // sempre a peça ORIGINAL + o estado das alterações: reabrir continua de onde parou
            arquivo={pecaEmEdicao.arquivo}
            estadoInicial={edicoes[pecaEmEdicao.tese]?.estado}
            tituloPeca={pecaEmEdicao.resumo?.modelo}
            onFechar={() => setPecaEmEdicao(null)}
            onAplicar={(e) => {
              const tese = pecaEmEdicao.tese;
              setEdicoes((atual) => {
                const { [tese]: _anterior, ...resto } = atual;
                return e.total > 0 ? { ...resto, [tese]: e } : resto;
              });
              setPecaEmEdicao(null);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
