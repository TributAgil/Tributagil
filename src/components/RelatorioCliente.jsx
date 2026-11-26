// src/components/RelatorioCliente.jsx
//
// Aba "Relatório para o cliente" do resultado da análise: o parecer em linguagem simples, com o timbre do escritório,
// os créditos atingidos (marcos da carteira, quando já calculados), os valores que o escritório informa e a estimativa
// de honorários de sucumbência (art. 85, § 3º, do CPC). A lógica fica em src/lib/relatorioCliente.js; aqui ficam o
// formulário, a pré-visualização (o mesmo HTML do PDF e do Word) e os botões.
//
// Os valores digitados ficam só neste navegador (localStorage, por análise): conveniência, não registro.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, FileType2, Copy, Check, AlertTriangle, Building2, Loader2, Info } from 'lucide-react';
import { montarRelatorio, relatorioHtml, relatorioTexto, valoresIniciais, formatarBRL, lerValorBR } from '../lib/relatorioCliente';
import { lerEscritorio, logoComoDataUrl } from '../lib/escritorio';
import { marcosDoCaso } from '../lib/carteira';
import ModalEscritorio from './ModalEscritorio';

const chave = (analiseId) => `tributagil:relatorio-cliente:${analiseId || 'sem-id'}`;

function lerSalvo(analiseId) {
  try {
    const bruto = window.localStorage.getItem(chave(analiseId));
    const obj = bruto ? JSON.parse(bruto) : null;
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

function gravar(analiseId, valores) {
  try {
    window.localStorage.setItem(chave(analiseId), JSON.stringify(valores));
  } catch {
    /* navegador sem armazenamento: o formulário continua funcionando */
  }
}

const Campo = ({ rotulo, dica, children }) => (
  <label className="block">
    <span className="block text-xs text-parchment/60 mb-1">{rotulo}</span>
    {children}
    {dica && <span className="block text-[11px] text-parchment/40 mt-1">{dica}</span>}
  </label>
);

const classeInput =
  'w-full rounded-lg bg-ink-900 border border-line px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-gold/50 focus:ring-2 focus:ring-gold/15';

export default function RelatorioCliente({ resultado, analiseId, casoId, user }) {
  const [valores, setValores] = useState(() => ({ ...valoresIniciais(resultado), ...(lerSalvo(analiseId) || {}) }));
  const [escritorio, setEscritorio] = useState(null);
  const [logo, setLogo] = useState('');
  const [marcos, setMarcos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [editandoEscritorio, setEditandoEscritorio] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [alturaPrevia, setAlturaPrevia] = useState(900);
  const refPrevia = useRef(null);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    Promise.all([lerEscritorio(user?.id), marcosDoCaso(casoId)]).then(async ([e, m]) => {
      if (!vivo) return;
      setEscritorio(e);
      setMarcos(m);
      setCarregando(false);
      const dataUrl = e?.logo_path ? await logoComoDataUrl(e.logo_path) : null;
      if (vivo) setLogo(dataUrl || '');
    });
    return () => {
      vivo = false;
    };
  }, [user?.id, casoId]);

  const atualizar = (patch) =>
    setValores((v) => {
      const novo = { ...v, ...patch };
      gravar(analiseId, novo);
      return novo;
    });

  const relatorio = useMemo(() => montarRelatorio({ resultado, escritorio, marcos, valores }), [resultado, escritorio, marcos, valores]);
  const html = useMemo(() => relatorioHtml(relatorio, { logo }), [relatorio, logo]);

  const ajustarAltura = () => {
    const doc = refPrevia.current?.contentDocument;
    if (doc?.body) setAlturaPrevia(Math.max(600, doc.documentElement.scrollHeight + 8));
  };

  const imprimir = () => {
    const janela = refPrevia.current?.contentWindow;
    if (!janela) return;
    janela.focus();
    janela.print();
  };

  const nomeArquivo = (ext) =>
    `Relatorio_cliente_${(relatorio.cliente || 'caso').replace(/[^\w]+/g, '_').slice(0, 40)}_${new Date().toISOString().slice(0, 10)}.${ext}`;

  const baixarWord = () => {
    const blob = new Blob(['﻿' + html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo('doc');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(relatorioTexto(relatorio));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  const total = lerValorBR(valores.total);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <h2 className="text-lg font-bold text-parchment">Relatório para o cliente</h2>
        <span className="text-sm text-parchment/50">O parecer em linguagem simples, com o timbre do escritório</span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* formulário */}
        <div className="space-y-4">
          <section className="rounded-xl border border-line bg-ink-800/50 p-4 space-y-3">
            <p className="text-xs font-semibold text-parchment/70 uppercase tracking-wider">Valores do débito</p>
            <Campo rotulo="Valor total atualizado do débito" dica="Do extrato mais recente (Procuradoria ou Secretaria da Fazenda).">
              <input
                className={classeInput}
                inputMode="decimal"
                value={valores.total}
                placeholder="R$ 0,00"
                onChange={(ev) => atualizar({ total: ev.target.value })}
                onBlur={() => total != null && atualizar({ total: formatarBRL(total) })}
              />
            </Campo>
            <Campo rotulo="Quanto desse valor é atingido pela prescrição ou decadência">
              <div className="flex gap-2">
                <input
                  className={classeInput}
                  inputMode="decimal"
                  value={valores.atingido}
                  placeholder="R$ 0,00"
                  onChange={(ev) => atualizar({ atingido: ev.target.value })}
                  onBlur={() => {
                    const n = lerValorBR(valores.atingido);
                    if (n != null) atualizar({ atingido: formatarBRL(n) });
                  }}
                />
                <button
                  type="button"
                  disabled={total == null}
                  onClick={() => atualizar({ atingido: formatarBRL(total) })}
                  className="shrink-0 rounded-lg border border-line px-3 text-xs text-parchment/70 hover:border-gold/40 hover:text-parchment disabled:opacity-40"
                  title="Copia o valor total"
                >
                  Toda a dívida
                </button>
              </div>
            </Campo>
            <Campo rotulo="Data de referência dos valores">
              <input className={classeInput} value={valores.data_valores} placeholder="DD/MM/AAAA" onChange={(ev) => atualizar({ data_valores: ev.target.value })} />
            </Campo>
          </section>

          <section className="rounded-xl border border-line bg-ink-800/50 p-4 space-y-3">
            <label className="flex items-start gap-2 text-sm text-parchment/80 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 accent-gold"
                checked={Boolean(valores.incluir_honorarios)}
                onChange={(ev) => atualizar({ incluir_honorarios: ev.target.checked })}
              />
              <span>
                Incluir a estimativa de honorários de sucumbência
                <span className="block text-[11px] text-parchment/45">Art. 85, § 3º, do CPC, em escada (§ 5º), sobre o valor atingido.</span>
              </span>
            </label>
            {valores.incluir_honorarios && (
              <Campo rotulo="Salário mínimo de referência" dica="R$ 1.621,00 desde 01/01/2026 (Decreto nº 12.797/2025). Confira o vigente na data da decisão.">
                <input className={classeInput} inputMode="decimal" value={valores.salario_minimo} onChange={(ev) => atualizar({ salario_minimo: ev.target.value })} />
              </Campo>
            )}
            {relatorio.honorarios && (
              <p className="text-xs text-parchment/70">
                Estimativa: <span className="text-gold font-semibold">{formatarBRL(relatorio.honorarios.min)}</span> a{' '}
                <span className="text-gold font-semibold">{formatarBRL(relatorio.honorarios.max)}</span>
              </p>
            )}
          </section>

          <section className="rounded-xl border border-line bg-ink-800/50 p-4 space-y-3">
            <Campo rotulo="Observações do escritório (opcional)" dica="Entram no relatório como estão escritas.">
              <textarea
                rows={4}
                maxLength={3000}
                className={`${classeInput} resize-y`}
                value={valores.observacoes}
                placeholder="Ex.: vamos protocolar a petição nesta semana; precisamos da procuração assinada."
                onChange={(ev) => atualizar({ observacoes: ev.target.value })}
              />
            </Campo>
          </section>

          {!carregando && !escritorio && (
            <button
              type="button"
              onClick={() => setEditandoEscritorio(true)}
              className="w-full flex items-center gap-2 rounded-xl border border-dashed border-gold/40 px-4 py-3 text-left text-sm text-gold hover:bg-gold/5"
            >
              <Building2 size={16} /> Cadastre o escritório (nome, logo e advogados) para o timbre do relatório
            </button>
          )}
          {escritorio && (
            <button type="button" onClick={() => setEditandoEscritorio(true)} className="text-xs text-parchment/50 hover:text-parchment underline underline-offset-2">
              Editar o timbre (cadastro do escritório)
            </button>
          )}

          {relatorio.pendencias.length > 0 && (
            <ul className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              {relatorio.pendencias.map((p) => (
                <li key={p} className="flex items-start gap-1.5 text-xs text-amber-200/90">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-400" /> {p}
                </li>
              ))}
            </ul>
          )}
          {!carregando && marcos.length === 0 && relatorio.achados.length > 0 && (
            <p className="flex items-start gap-1.5 text-[11px] text-parchment/45">
              <Info size={13} className="mt-0.5 shrink-0" />
              Os créditos atingidos (CDA e período) aparecem aqui depois que os prazos do caso são calculados: ao gerar a peça ou em "Carteira e prazos".
            </p>
          )}
        </div>

        {/* pré-visualização + ações */}
        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={imprimir}
              className="mi-press inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-soft"
            >
              <Printer size={15} /> Imprimir ou salvar em PDF
            </button>
            <button
              type="button"
              onClick={baixarWord}
              className="mi-press inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-parchment/80 hover:border-gold/40"
            >
              <FileType2 size={15} /> Relatório em Word
            </button>
            <button
              type="button"
              onClick={copiar}
              className="mi-press inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-parchment/80 hover:border-gold/40"
              title="Copia o relatório em texto, para colar num e-mail ou mensagem"
            >
              {copiado ? <Check size={15} className="text-gold" /> : <Copy size={15} />} {copiado ? 'Copiado' : 'Copiar texto'}
            </button>
            {carregando && <Loader2 size={15} className="animate-spin text-gold" />}
          </div>
          <div className="rounded-xl border border-line bg-white overflow-hidden">
            <iframe
              ref={refPrevia}
              title="Pré-visualização do relatório para o cliente"
              srcDoc={html}
              sandbox="allow-same-origin allow-modals"
              onLoad={ajustarAltura}
              style={{ height: alturaPrevia }}
              className="block w-full bg-white"
            />
          </div>
        </div>
      </div>

      {editandoEscritorio && (
        <ModalEscritorio
          user={user}
          inicial={escritorio}
          onFechar={() => setEditandoEscritorio(false)}
          onSalvo={async (e) => {
            setEscritorio(e);
            setEditandoEscritorio(false);
            setLogo((e?.logo_path && (await logoComoDataUrl(e.logo_path))) || '');
          }}
        />
      )}
    </div>
  );
}
