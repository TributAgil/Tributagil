// src/components/ModalGerarPeca.jsx
//
// Fluxo de "Gerar peça (Word)": (1) garante o cadastro do escritório (abre o
// formulário na primeira vez); (2) uma chamada a /api/gerar-peca devolve
// RESUMO + arquivo; (3) o usuário vê o resumo (modelo, CDAs/períodos, quantos
// campos [PREENCHER], avisos e o aviso fixo de revisão) e só então baixa o .docx.
// Peça bloqueada pelo motor ou sem modelo mostra o motivo, nunca um arquivo.

import React, { useEffect, useState } from 'react';
import { X, Loader2, FileType2, AlertTriangle, CheckCircle2, Building2, Download } from 'lucide-react';
import { lerEscritorio } from '../lib/escritorio';
import { gerarPeca, baixarArquivo } from '../lib/peca';
import ModalEscritorio from './ModalEscritorio';

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

  useEffect(() => {
    let vivo = true;
    lerEscritorio(user?.id).then((e) => {
      if (!vivo) return;
      setEscritorio(e);
      setFase(e ? 'pronto' : 'cadastro'); // primeira vez, sem cadastro: abre o formulário
    });
    return () => {
      vivo = false;
    };
  }, [user?.id]);

  const gerar = async () => {
    setFase('gerando');
    setErro('');
    const r = await gerarPeca({ analiseId: analise.id, incluirBlocoDecretoLei: incluirBloco });
    if (!r.ok) {
      setErro(r.error);
      setFase('erro');
      return;
    }
    setResultado(r);
    setFase('resultado');
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

  const r = resultado;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={fase === 'gerando' ? undefined : onFechar} />
      <div className="relative bg-ink-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto border border-line">
        {fase !== 'gerando' && (
          <button onClick={onFechar} className="absolute right-4 top-4 text-parchment/40 hover:text-parchment transition-colors" aria-label="Fechar">
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
            <div className="rounded-xl bg-ink-900/60 border border-line p-4 space-y-2 text-sm">
              <p className="text-parchment">
                <span className="text-parchment/50">Modelo: </span>
                {r.resumo.modelo}
              </p>
              <p className="text-parchment">
                <span className="text-parchment/50">Tese: </span>
                {r.resumo.tese}
              </p>
              <div>
                <p className="text-parchment/50 text-xs mb-1">CDAs / períodos que entram na peça</p>
                <ul className="text-xs text-parchment/80 space-y-0.5">
                  {r.resumo.creditos.map((c, i) => (
                    <li key={i}>
                      {c.cda} — período {c.periodo}: {c.termo_inicial} → {c.consumacao}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-parchment">
                <span className="text-parchment/50">A preencher no Word: </span>
                {r.resumo.campos_preencher} campo(s) <span className="text-parchment/40">+</span> {r.resumo.figuras} figura(s) a inserir
                <span className="text-parchment/40"> (destacados em amarelo)</span>
              </p>
            </div>

            <Lista itens={r.resumo.avisos} cor="text-amber-400" />

            <p className="text-xs text-red-300 flex items-start gap-1.5 border border-red-500/30 bg-red-500/10 rounded-lg p-2.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> <span>{r.resumo.aviso_fixo}</span>
            </p>

            <div className="flex gap-3">
              <button onClick={onFechar} className="flex-1 py-2.5 text-sm text-parchment/60 bg-ink-700 hover:bg-ink-600 rounded-xl">
                Fechar
              </button>
              <button
                onClick={() => baixarArquivo(r.arquivo)}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-ink bg-gold hover:bg-gold/90 rounded-xl shadow-lg shadow-gold/20"
              >
                <Download size={15} /> Baixar peça (.docx)
              </button>
            </div>
          </div>
        )}

        {fase === 'resultado' && r?.status !== 'ok' && (
          <div className="space-y-3">
            <p className="text-sm text-amber-400 flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{r?.mensagem || 'A peça não pode ser gerada automaticamente.'}</span>
            </p>
            {r?.bloqueios?.length > 0 && (
              <div>
                <p className="text-xs text-parchment/50 mb-1">Motivos</p>
                <Lista itens={r.bloqueios} cor="text-parchment/80" />
              </div>
            )}
            {r?.divergencias?.length > 0 && (
              <div>
                <p className="text-xs text-parchment/50 mb-1">Divergência com o parecer</p>
                <Lista itens={r.divergencias} cor="text-parchment/80" />
              </div>
            )}
            {r?.status === 'bloqueada' && <p className="text-xs text-parchment/50">Este caso exige análise manual do advogado responsável.</p>}
            <Lista itens={r?.avisos} cor="text-parchment/50" />
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
    </div>
  );
}
