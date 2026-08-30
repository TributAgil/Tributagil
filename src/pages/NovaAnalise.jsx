import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Loader2, AlertTriangle, History } from 'lucide-react';
import { AreaUpload } from '../components/AreaUpload';
import BotaoComecarAnalise from '../components/BotaoComecarAnalise';
import BarraCreditos from '../components/BarraCreditos';
import ModalConfirmarUpload from '../components/ModalConfirmarUpload';
import { formatarBytes, LIMITE_TOTAL_DOCS } from '../lib/prepararDocumentos';
import { uploadDocumento, removerDocumentos } from '../lib/storageDocumentos';
import { listarDocumentosCaso, registrarDocumentoCaso } from '../lib/casos';
import { indexarCaso } from '../lib/lu';
import RodapeLegal from '../components/RodapeLegal';

const AREA_CONFIG = {
  principal: {
    id: 'principal',
    titulo: 'Documentos Principais',
    descricao: 'Documentos essenciais para a análise tributária',
    tooltip: 'CDA, Auto de Infração/Notificação, Petição Inicial, Despacho "Cite-se", Mandado Frustrado e SISBAJUD.',
  },
  secundario: {
    id: 'secundario',
    titulo: 'Documentos Secundários',
    descricao: 'Documentos complementares para enriquecer a análise',
    tooltip: 'Extratos (e-CAC/SEFAZ), DCTF/PGDAS, Comprovantes DARF/DAS, Andamento Integral, Decisões Administrativas e CPEN.',
  },
};

const novoId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * @param {{
 *   user: object,
 *   onIniciarAnalise: (payload: object) => void,
 *   onVoltar: () => void,
 *   casoExistente?: { id: string, titulo?: string } | null,
 * }} props
 *
 * Quando `casoExistente` é informado, esta tela funciona em modo de
 * REANÁLISE: os documentos já anexados ao caso aparecem travados (não podem
 * ser removidos/substituídos — proteção antifraude) e qualquer arquivo novo
 * exige confirmação explícita antes do upload.
 */
const NovaAnalise = ({ user, onIniciarAnalise, onVoltar, casoExistente = null }) => {
  const emReanalise = !!casoExistente?.id;

  const [arquivos, setArquivos] = useState([]);
  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [carregandoCaso, setCarregandoCaso] = useState(emReanalise);
  const [confirmacaoPendente, setConfirmacaoPendente] = useState(null); // { areaId, novosArquivos }
  const [saldoCreditos, setSaldoCreditos] = useState(null); // null = desconhecido (não bloqueia)
  const analiseIdRef = useRef(novoId());
  const confirmandoUploadRef = useRef(false);

  useEffect(() => {
    const on = () => setIsDraggingGlobal(true);
    const off = () => setIsDraggingGlobal(false);
    window.addEventListener('dragenter', on);
    window.addEventListener('dragleave', off);
    window.addEventListener('drop', off);
    return () => {
      window.removeEventListener('dragenter', on);
      window.removeEventListener('dragleave', off);
      window.removeEventListener('drop', off);
    };
  }, []);

  // Reanálise: carrega os documentos já anexados ao caso (travados na tela).
  useEffect(() => {
    if (!casoExistente?.id) return;
    let vivo = true;
    listarDocumentosCaso(casoExistente.id).then((docs) => {
      if (!vivo) return;
      setArquivos((prev) => [
        ...docs.map((d) => ({
          id: d.id,
          nome: d.nome || 'Documento',
          extensao: '',
          tipo: d.mime_type,
          mimeFinal: d.mime_type,
          tamanho: d.tamanho_bytes || 0,
          tamanhoFinal: d.tamanho_bytes || 0,
          area: d.categoria || 'principal',
          status: 'pronto',
          storagePath: d.storage_path,
          bloqueado: true,
        })),
        ...prev,
      ]);
      setCarregandoCaso(false);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casoExistente?.id]);

  const enviarParaStorage = async (novos, { registrarNoCaso = false } = {}) => {
    for (const item of novos) {
      if (item.status !== 'processando' || !item._file) continue;
      try {
        const { storagePath, mime, tamanho } = await uploadDocumento({
          userId: user?.id,
          analiseId: casoExistente?.id || analiseIdRef.current,
          fileId: item.id,
          file: item._file,
        });
        setArquivos((prev) =>
          prev.map((a) =>
            a.id === item.id
              ? { ...a, status: 'pronto', mimeFinal: mime, storagePath, tamanhoFinal: tamanho, _file: undefined }
              : a,
          ),
        );

        if (registrarNoCaso && casoExistente?.id) {
          await registrarDocumentoCaso({
            casoId: casoExistente.id,
            userId: user?.id,
            nome: item.nome,
            mimeType: mime,
            categoria: item.area,
            storagePath,
            tamanhoBytes: tamanho,
          });
          // Best-effort: indexa só este documento novo na base vetorial do
          // Lu — os antigos já foram indexados quando entraram no caso.
          indexarCaso({
            casoId: casoExistente.id,
            documentos: [{ nome: item.nome, mime_type: mime, storage_path: storagePath }],
          });
        }
      } catch (err) {
        console.error('[NovaAnalise] Falha ao enviar arquivo:', err);
        setArquivos((prev) =>
          prev.map((a) =>
            a.id === item.id
              ? { ...a, status: 'erro', motivoErro: err?.message || 'Falha ao enviar o arquivo.', _file: undefined }
              : a,
          ),
        );
      }
    }
  };

  const handleAdicionarArquivos = (areaId, novosArquivos) => {
    // Reanálise: arquivo complementar exige confirmação explícita ANTES do upload.
    if (emReanalise) {
      setConfirmacaoPendente({ areaId, novosArquivos });
      return;
    }
    setArquivos((prev) => [...prev, ...novosArquivos]);
    enviarParaStorage(novosArquivos);
  };

  const confirmarAdicaoComplementar = () => {
    // Guarda por ref (não por state): um duplo clique/toque antes do modal
    // desmontar chamaria este handler duas vezes com o MESMO `confirmacaoPendente`
    // (state ainda não re-renderizou) — sem isso, o mesmo arquivo seria
    // registrado duas vezes em `documentos_caso` (a tabela não tem unique
    // constraint em storage_path, e a ledger é insert-only por design).
    if (confirmandoUploadRef.current) return;
    confirmandoUploadRef.current = true;

    const pendentes = confirmacaoPendente;
    setConfirmacaoPendente(null);
    if (pendentes) {
      setArquivos((prev) => [...prev, ...pendentes.novosArquivos]);
      enviarParaStorage(pendentes.novosArquivos, { registrarNoCaso: true });
    }

    confirmandoUploadRef.current = false;
  };

  const cancelarAdicaoComplementar = () => setConfirmacaoPendente(null);

  const handleRemoverArquivo = (arquivoId) => {
    setArquivos((prev) => {
      const alvo = prev.find((a) => a.id === arquivoId);
      // Documentos já registrados no caso não podem ser removidos (antifraude).
      if (alvo?.bloqueado) return prev;
      if (alvo?.storagePath) removerDocumentos([alvo.storagePath]);
      return prev.filter((a) => a.id !== arquivoId);
    });
  };

  const prontos = arquivos.filter((a) => a.status === 'pronto' && a.storagePath);
  const principaisProntos = prontos.filter((a) => a.area === 'principal');
  const novosNaoBloqueados = prontos.filter((a) => !a.bloqueado);
  const processando = arquivos.some((a) => a.status === 'processando');
  const totalBytes = prontos.reduce((s, a) => s + (a.tamanhoFinal || 0), 0);
  const acimaDoLimite = totalBytes > LIMITE_TOTAL_DOCS;
  const semCreditos = saldoCreditos === 0;
  const podeAnalisar =
    principaisProntos.length > 0 &&
    !processando &&
    !acimaDoLimite &&
    !analisando &&
    !semCreditos &&
    !carregandoCaso &&
    (!emReanalise || novosNaoBloqueados.length > 0);

  const handleAnalisar = () => {
    if (!podeAnalisar) return;
    const payload = {
      metadata: {
        usuario_id: user?.id || null,
        analise_id: analiseIdRef.current,
        caso_id: casoExistente?.id || null,
        timestamp: new Date().toISOString(),
        total_arquivos: prontos.length,
        origem: 'tributagil_web',
      },
      documentos: prontos.map((a) => ({
        id: a.id,
        nome: a.nome,
        mime_type: a.mimeFinal || a.tipo,
        categoria: a.area,
        storage_path: a.storagePath,
        tamanho_bytes: a.tamanhoFinal || a.tamanho || null,
      })),
    };
    setAnalisando(true);
    onIniciarAnalise(payload);
  };

  const pctLimite = Math.min(100, Math.round((totalBytes / LIMITE_TOTAL_DOCS) * 100));

  return (
    <div className="bg-noir min-h-screen font-sans text-parchment">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 sm:px-6 py-5">
          <button
            onClick={onVoltar}
            disabled={analisando}
            className="rounded-lg border border-line p-2 text-parchment/50 transition-colors hover:border-gold/40 hover:text-gold disabled:opacity-40"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="font-display text-xl font-semibold text-parchment flex items-center gap-2">
              {emReanalise ? (
                <>
                  <History size={18} className="text-gold" />
                  Reanálise do Caso
                </>
              ) : (
                'Nova Análise'
              )}
            </h1>
            <p className="text-sm text-parchment/45">
              {emReanalise ? (
                <>
                  Adicione o(s) documento(s) novo(s) — os já anexados a este caso
                  {' '}<strong className="text-parchment/70">permanecem intactos</strong> e uma nova versão do parecer será gerada.
                </>
              ) : (
                <>Anexe os documentos — a IA analisa <strong className="text-parchment/70">somente</strong> o que for enviado aqui.</>
              )}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
        <div className="mb-6">
          <BarraCreditos userId={user?.id} onSaldo={setSaldoCreditos} />
        </div>

        {carregandoCaso && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-line bg-ink-800/50 px-4 py-3 text-sm text-parchment/45">
            <Loader2 size={14} className="animate-spin" /> Carregando documentos já anexados ao caso...
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AreaUpload
            config={AREA_CONFIG.principal}
            arquivos={arquivos}
            onAdicionarArquivos={handleAdicionarArquivos}
            onRemoverArquivo={handleRemoverArquivo}
            isDraggingGlobal={isDraggingGlobal}
          />
          <AreaUpload
            config={AREA_CONFIG.secundario}
            arquivos={arquivos}
            onAdicionarArquivos={handleAdicionarArquivos}
            onRemoverArquivo={handleRemoverArquivo}
            isDraggingGlobal={isDraggingGlobal}
          />
        </div>

        {prontos.length > 0 && (
          <div className="mb-8">
            <div className="mb-1 flex items-center justify-between text-xs text-parchment/45">
              <span>Tamanho total dos documentos</span>
              <span className={acimaDoLimite ? 'font-semibold text-red-400' : ''}>
                {formatarBytes(totalBytes)} / {formatarBytes(LIMITE_TOTAL_DOCS)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink-700">
              <div
                className={`h-full rounded-full transition-all ${acimaDoLimite ? 'bg-red-500' : 'bg-gold'}`}
                style={{ width: `${pctLimite}%` }}
              />
            </div>
            {acimaDoLimite && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-red-400">
                <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                Limite excedido. Remova alguns arquivos desta análise.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col items-center gap-3 pt-2">
          <BotaoComecarAnalise onComecar={handleAnalisar} disabled={!podeAnalisar}>
            {analisando ? 'Enviando para análise...' : emReanalise ? 'Gerar Nova Versão' : 'Analisar Documento'}
          </BotaoComecarAnalise>

          {processando && (
            <p className="flex items-center gap-2 text-xs text-parchment/45">
              <Loader2 size={13} className="animate-spin" /> Preparando arquivos...
            </p>
          )}
          {!processando && principaisProntos.length === 0 && (
            <p className="text-xs text-parchment/35">Adicione ao menos 1 documento principal.</p>
          )}
          {!processando && principaisProntos.length > 0 && emReanalise && novosNaoBloqueados.length === 0 && (
            <p className="text-xs text-parchment/35">Adicione ao menos 1 documento novo para gerar uma nova versão.</p>
          )}
          {semCreditos && (
            <p className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertTriangle size={13} className="flex-shrink-0" />
              Você atingiu o limite de análises do seu plano. Renove ou adquira créditos avulsos para continuar.
            </p>
          )}
        </div>
      </main>

      <ModalConfirmarUpload
        aberto={!!confirmacaoPendente}
        arquivos={confirmacaoPendente?.novosArquivos || []}
        onConfirmar={confirmarAdicaoComplementar}
        onCancelar={cancelarAdicaoComplementar}
      />

      <RodapeLegal />
    </div>
  );
};

export default NovaAnalise;
