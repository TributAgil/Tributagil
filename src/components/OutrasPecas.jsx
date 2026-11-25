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
];

/**
 * @param {{ analiseId: string, userId: string, dadosPeca?: object, onGerada: (peca: object, usados?: object) => void }} props
 */
export default function OutrasPecas({ analiseId, userId, dadosPeca = null, onGerada }) {
  const [aberta, setAberta] = useState(null); // tipo aberto
  const [arquivo, setArquivo] = useState(null);
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
      const r = await gerarPecaExtra({ analiseId, tipo: opcao.tipo, manifestacao, dadosPeca });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setArquivo(null);
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
