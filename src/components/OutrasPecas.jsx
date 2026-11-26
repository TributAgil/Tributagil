// src/components/OutrasPecas.jsx
//
// "Outras peças" no modal da peça: as peças EXTRAS no modelo genérico (api/_gerar-extra.js), cada uma com a sua
// entrada própria. A primeira é a réplica à manifestação da Fazenda: o advogado envia o PDF da impugnação, o sistema lê
// os argumentos (IA só extrai), confronta cada um com os prazos calculados (código) e monta a réplica. A peça volta no
// mesmo formato das outras (revisar no editor, baixar, salvar).

import React, { useState } from 'react';
import { FilePlus2, Loader2, AlertTriangle, Upload, ChevronDown } from 'lucide-react';
import { gerarPecaExtra } from '../lib/peca';
import { uploadDocumento } from '../lib/storageDocumentos';

const MAX_BYTES = 12 * 1024 * 1024;
const ACEITOS = 'application/pdf,image/png,image/jpeg,image/webp';

export const OPCOES_EXTRAS = [
  {
    tipo: 'replica',
    nome: 'Réplica à manifestação da Fazenda',
    descricao:
      'Envie a impugnação (ou a resposta da Procuradoria). O sistema lê cada argumento, confronta as datas alegadas com os prazos calculados e monta a réplica: o que o cálculo afasta sai respondido; o que pode proceder sai marcado para você conferir.',
    arquivo: true,
    espera: 'Lendo a manifestação, confrontando com os prazos e montando a réplica… (até 2 minutos)',
  },
  {
    tipo: 'embargos',
    nome: 'Embargos à execução fiscal',
    descricao:
      'Com a execução garantida: tempestividade (30 dias, art. 16 da LEF), garantia do juízo, as matérias de defesa que o cálculo do caso sustenta, efeito suspensivo, provas e valor da causa.',
    campos: [
      { chave: 'data_garantia', rotulo: 'Data da intimação da penhora (ou do depósito / da juntada da fiança)', tipo: 'data' },
      {
        chave: 'forma_garantia',
        rotulo: 'Garantia do juízo',
        tipo: 'opcoes',
        opcoes: [
          ['penhora', 'Penhora'],
          ['deposito', 'Depósito em dinheiro'],
          ['fianca_seguro', 'Fiança bancária ou seguro garantia'],
        ],
      },
    ],
    espera: 'Lendo os documentos e montando os embargos… (até 2 minutos)',
  },
  {
    tipo: 'agravo',
    nome: 'Agravo de instrumento',
    descricao:
      'Contra a decisão que rejeitou a exceção de pré-executividade: tempestividade (15 dias úteis), peças obrigatórias, razões de reforma pelo cálculo do caso e pedido de efeito suspensivo.',
    campos: [
      { chave: 'data_intimacao_decisao', rotulo: 'Data da intimação da decisão', tipo: 'data' },
      { chave: 'tribunal', rotulo: 'Tribunal (opcional)', tipo: 'texto', dica: 'ex.: Tribunal Regional Federal da 1ª Região' },
      { chave: 'resumo_decisao', rotulo: 'O que a decisão disse (opcional)', tipo: 'area', dica: 'ex.: rejeitou a exceção por entender que a matéria exige dilação probatória' },
    ],
    espera: 'Lendo os documentos e montando o agravo… (até 2 minutos)',
  },
  {
    tipo: 'reconhecimento_intercorrente',
    nome: 'Pedido de reconhecimento da prescrição intercorrente',
    descricao: 'Petição simples nos autos (art. 40, § 4º, da LEF), com as datas do cálculo: só quando a intercorrente já se consumou.',
    espera: 'Lendo os documentos e montando o pedido… (até 2 minutos)',
  },
];

// <input type="date"> devolve AAAA-MM-DD; a API recebe DD/MM/AAAA
const paraBR = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/**
 * @param {{ analiseId: string, userId: string, dadosPeca?: object, onGerada: (peca: object, usados?: object) => void }} props
 */
export default function OutrasPecas({ analiseId, userId, dadosPeca = null, onGerada }) {
  const [aberta, setAberta] = useState(null); // tipo aberto
  const [arquivo, setArquivo] = useState(null);
  const [entrada, setEntrada] = useState({});
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');

  const escolherArquivo = (file) => {
    setErro('');
    if (!file) return setArquivo(null);
    if (!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(file.type)) return setErro('Envie a manifestação em PDF ou imagem (PNG, JPG ou WEBP).');
    if (file.size > MAX_BYTES) return setErro('Arquivo grande demais (máximo de 12 MB).');
    setArquivo(file);
  };

  const gerar = async (opcao) => {
    setGerando(true);
    setErro('');
    try {
      let manifestacao = null;
      if (opcao.arquivo) {
        if (!arquivo) {
          setErro('Escolha o arquivo da manifestação.');
          return;
        }
        const up = await uploadDocumento({ userId, analiseId, fileId: `manifestacao-${Date.now()}`, file: arquivo });
        manifestacao = { storage_path: up.storagePath, nome: arquivo.name, mime_type: up.mime };
      }
      const valores = Object.fromEntries(
        (opcao.campos || []).map((c) => [c.chave, c.tipo === 'data' ? paraBR(entrada[c.chave]) : String(entrada[c.chave] ?? (c.tipo === 'opcoes' ? c.opcoes[0][0] : ''))]),
      );
      const r = await gerarPecaExtra({ analiseId, tipo: opcao.tipo, manifestacao, entrada: valores, dadosPeca });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setArquivo(null);
      setEntrada({});
      setAberta(null);
      onGerada?.(r.peca, r.dados_peca_usados);
    } catch (err) {
      setErro(err?.message || 'Não foi possível enviar o arquivo.');
    } finally {
      setGerando(false);
    }
  };

  return (
    <section className="rounded-xl border border-line p-3 space-y-2" aria-label="Outras peças">
      <p className="text-xs text-parchment/50 flex items-center gap-1.5">
        <FilePlus2 size={13} className="text-gold" /> Outras peças deste caso
      </p>
      {OPCOES_EXTRAS.map((o) => {
        const estaAberta = aberta === o.tipo;
        return (
          <div key={o.tipo} className="rounded-lg bg-ink-900/60 border border-line">
            <button
              onClick={() => {
                setAberta(estaAberta ? null : o.tipo);
                setErro('');
                setEntrada({});
              }}
              disabled={gerando}
              aria-expanded={estaAberta}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-parchment/90 hover:text-parchment"
            >
              <span className="flex-1">{o.nome}</span>
              <ChevronDown size={14} className={`transition-transform ${estaAberta ? 'rotate-180' : ''}`} />
            </button>
            {estaAberta && (
              <div className="px-3 pb-3 space-y-2">
                <p className="text-xs text-parchment/60 leading-relaxed">{o.descricao}</p>
                {o.arquivo && (
                  <label className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-parchment/70 cursor-pointer hover:border-gold/50">
                    <Upload size={14} className="text-gold" />
                    <span className="flex-1 truncate">{arquivo ? arquivo.name : 'Escolher o arquivo da manifestação (PDF ou imagem)'}</span>
                    <input type="file" accept={ACEITOS} className="sr-only" disabled={gerando} onChange={(ev) => escolherArquivo(ev.target.files?.[0] || null)} />
                  </label>
                )}
                {(o.campos || []).map((c) => (
                  <label key={c.chave} className="block">
                    <span className="block text-[11px] text-parchment/50 mb-1">{c.rotulo}</span>
                    {c.tipo === 'opcoes' ? (
                      <select
                        value={entrada[c.chave] ?? c.opcoes[0][0]}
                        disabled={gerando}
                        onChange={(ev) => setEntrada((e) => ({ ...e, [c.chave]: ev.target.value }))}
                        className="w-full rounded-lg bg-ink-900 border border-line px-2.5 py-1.5 text-sm text-parchment focus:outline-none focus:border-gold/50"
                      >
                        {c.opcoes.map(([v, r]) => (
                          <option key={v} value={v}>{r}</option>
                        ))}
                      </select>
                    ) : c.tipo === 'area' ? (
                      <textarea
                        rows={3}
                        maxLength={1500}
                        value={entrada[c.chave] || ''}
                        placeholder={c.dica}
                        disabled={gerando}
                        onChange={(ev) => setEntrada((e) => ({ ...e, [c.chave]: ev.target.value }))}
                        className="w-full resize-y rounded-lg bg-ink-900 border border-line px-2.5 py-1.5 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-gold/50"
                      />
                    ) : (
                      <input
                        type={c.tipo === 'data' ? 'date' : 'text'}
                        maxLength={c.tipo === 'texto' ? 120 : undefined}
                        value={entrada[c.chave] || ''}
                        placeholder={c.dica}
                        disabled={gerando}
                        onChange={(ev) => setEntrada((e) => ({ ...e, [c.chave]: ev.target.value }))}
                        className="w-full rounded-lg bg-ink-900 border border-line px-2.5 py-1.5 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-gold/50"
                      />
                    )}
                  </label>
                ))}
                {erro && (
                  <p className="text-xs text-amber-400 flex items-start gap-1.5">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {erro}
                  </p>
                )}
                {gerando ? (
                  <p className="text-xs text-parchment/60 flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-gold" /> {o.espera}
                  </p>
                ) : (
                  <button
                    onClick={() => gerar(o)}
                    className="w-full py-2 text-sm font-semibold text-ink bg-gold hover:bg-gold/90 rounded-lg disabled:opacity-40"
                    disabled={o.arquivo && !arquivo}
                  >
                    Gerar {o.nome.toLowerCase()}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
