// src/components/ModalEscritorio.jsx
//
// Cadastro do escritório: dados do timbrado (e-mail, site, endereço, logo),
// cidade/UF do fecho e a lista de advogados da assinatura. Aberto
// automaticamente na primeira vez que o usuário pede uma peça; depois, editável.

import React, { useEffect, useState } from 'react';
import { X, Loader2, Building2, Plus, Trash2, AlertTriangle, ImagePlus } from 'lucide-react';
import { escritorioVazio, salvarEscritorio, enviarLogo, urlDoLogo, validarEscritorio, MAX_ADVOGADOS } from '../lib/escritorio';

const campo =
  'w-full rounded-xl bg-ink-900/60 border border-line px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-gold/50';

const Rotulo = ({ children, texto }) => (
  <label className="block">
    <span className="block text-xs text-parchment/50 mb-1">{texto}</span>
    {children}
  </label>
);

export default function ModalEscritorio({ user, inicial, onSalvo, onFechar }) {
  const [e, setE] = useState(() => ({ ...escritorioVazio(), ...(inicial || {}), advogados: inicial?.advogados?.length ? inicial.advogados : escritorioVazio().advogados }));
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [previa, setPrevia] = useState(null);

  useEffect(() => {
    let vivo = true;
    urlDoLogo(e.logo_path).then((u) => vivo && setPrevia(u));
    return () => {
      vivo = false;
    };
  }, [e.logo_path]);

  // editar qualquer campo limpa o erro anterior (senão a mensagem velha fica na tela até o próximo salvar)
  const upd = (patch) => { setErro(''); setE((x) => ({ ...x, ...patch })); };
  const updAdv = (i, patch) => { setErro(''); setE((x) => ({ ...x, advogados: x.advogados.map((a, k) => (k === i ? { ...a, ...patch } : a)) })); };

  const escolherLogo = async (ev) => {
    const arquivo = ev.target.files?.[0];
    ev.target.value = '';
    if (!arquivo) return;
    setErro('');
    setEnviando(true);
    const r = await enviarLogo(user.id, arquivo);
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    upd({ logo_path: r.caminho });
  };

  const salvar = async () => {
    const problemas = validarEscritorio(e);
    if (problemas.length) return setErro(problemas.join(' '));
    setErro('');
    setSalvando(true);
    const r = await salvarEscritorio(user.id, e);
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    onSalvo?.(e);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative bg-ink-800 rounded-2xl shadow-2xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto border border-line">
        <button onClick={onFechar} className="absolute right-4 top-4 text-parchment/40 hover:text-parchment transition-colors" aria-label="Fechar">
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-gold/15 flex items-center justify-center">
            <Building2 size={22} className="text-gold" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-parchment">Dados do escritório</h3>
            <p className="text-xs text-parchment/50">Usados no timbrado e na assinatura das peças geradas.</p>
          </div>
        </div>

        <div className="space-y-3">
          <Rotulo texto="Nome do escritório *">
            <input className={campo} value={e.nome} maxLength={160} onChange={(x) => upd({ nome: x.target.value })} />
          </Rotulo>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Rotulo texto="Cidade (fecho da peça)">
                <input className={campo} value={e.cidade || ''} maxLength={120} onChange={(x) => upd({ cidade: x.target.value })} />
              </Rotulo>
            </div>
            <Rotulo texto="UF">
              <input className={campo} value={e.uf || ''} maxLength={2} onChange={(x) => upd({ uf: x.target.value.toUpperCase() })} placeholder="BA" />
            </Rotulo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Rotulo texto="E-mail (rodapé)">
              <input className={campo} value={e.email || ''} maxLength={160} onChange={(x) => upd({ email: x.target.value })} />
            </Rotulo>
            <Rotulo texto="Site (rodapé)">
              <input className={campo} value={e.site || ''} maxLength={160} onChange={(x) => upd({ site: x.target.value })} />
            </Rotulo>
          </div>
          <Rotulo texto="Endereço (rodapé)">
            <input className={campo} value={e.endereco || ''} maxLength={300} onChange={(x) => upd({ endereco: x.target.value })} />
          </Rotulo>

          <div>
            <span className="block text-xs text-parchment/50 mb-1">Logo (opcional — PNG ou JPG, até 1 MB). Sem logo, o cabeçalho fica limpo.</span>
            <div className="flex items-center gap-3">
              {previa ? <img src={previa} alt="Logo do escritório" className="h-12 max-w-[8rem] object-contain rounded bg-white/90 p-1" /> : null}
              <label className="inline-flex items-center gap-2 px-3 py-2 text-sm text-parchment/70 bg-ink-700 hover:bg-ink-600 rounded-xl cursor-pointer transition-colors">
                {enviando ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                {e.logo_path ? 'Trocar logo' : 'Enviar logo'}
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={escolherLogo} />
              </label>
              {e.logo_path ? (
                <button type="button" onClick={() => upd({ logo_path: null })} className="text-xs text-parchment/50 hover:text-red-400">
                  Remover
                </button>
              ) : null}
            </div>
          </div>

          <div>
            <span className="block text-xs text-parchment/50 mb-1">Advogados (assinatura da peça)</span>
            <div className="space-y-2">
              {e.advogados.map((a, i) => (
                <div key={i} className="grid grid-cols-[1fr_7rem_3.5rem_auto] gap-2 items-center">
                  <input className={campo} placeholder="Nome completo" value={a.nome} maxLength={160} onChange={(x) => updAdv(i, { nome: x.target.value })} />
                  <input className={campo} placeholder="OAB nº" value={a.oab} maxLength={20} onChange={(x) => updAdv(i, { oab: x.target.value })} />
                  <input className={campo} placeholder="UF" value={a.uf} maxLength={2} onChange={(x) => updAdv(i, { uf: x.target.value.toUpperCase() })} />
                  <button
                    type="button"
                    onClick={() => setE((x) => ({ ...x, advogados: x.advogados.filter((_, k) => k !== i) }))}
                    className="p-2 text-parchment/40 hover:text-red-400"
                    aria-label="Remover advogado"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            {e.advogados.length < MAX_ADVOGADOS && (
              <button
                type="button"
                onClick={() => setE((x) => ({ ...x, advogados: [...x.advogados, { nome: '', oab: '', uf: '' }] }))}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-gold hover:underline"
              >
                <Plus size={12} /> Adicionar advogado
              </button>
            )}
          </div>

          {erro && (
            <p className="text-xs text-red-400 flex items-start gap-1.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> <span>{erro}</span>
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={onFechar} className="flex-1 py-2.5 text-sm font-medium text-parchment/60 bg-ink-700 hover:bg-ink-600 rounded-xl transition-colors">
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={salvando || enviando}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-ink bg-gold hover:bg-gold/90 rounded-xl shadow-lg shadow-gold/20 transition-all disabled:opacity-50"
            >
              {salvando && <Loader2 size={15} className="animate-spin" />}
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
