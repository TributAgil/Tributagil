// src/pages/Historico.jsx
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search,
  Download,
  Trash2,
  Calendar,
  Scale,
  Shield,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MoreVertical,
  FolderOpen,
  Eye,
  Loader2,
  RefreshCw,
  LogOut,
  History,
  FilePlus2,
} from 'lucide-react';
import {
  listarAnalises,
  excluirAnalise,
  caminhosDocumentos,
  exportarHistorico,
} from '../lib/analises';
import { excluirCasoCompleto } from '../lib/casos';
import { removerDocumentos } from '../lib/storageDocumentos';
import RodapeLegal from '../components/RodapeLegal';

// ============================================
// HELPERS
// ============================================
function formatarDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

// ============================================
// COMPONENTE: CARD DE ANÁLISE (histórico real)
// ============================================
const CardAnalise = ({ item, onReabrir, onBaixar, onExcluir, onReanalisar }) => {
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <div className="bg-ink-800/50 rounded-xl border border-line hover:border-gold/40 hover:shadow-md transition-all group">
      <div className="px-5 py-4 border-b border-line flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-ink-700 flex items-center justify-center group-hover:bg-gold/10 transition-colors flex-shrink-0">
            <FolderOpen size={18} className="text-parchment/50 group-hover:text-gold transition-colors" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-parchment truncate">{item.titulo}</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gold/10 text-gold flex-shrink-0">
                <CheckCircle2 size={10} />
                Concluída
              </span>
              {item.versao > 1 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 text-parchment/60 border border-line flex-shrink-0">
                  <History size={10} /> v{item.versao}
                </span>
              )}
            </div>
            <p className="text-xs text-parchment/40 mt-0.5 font-mono truncate">#{String(item.id).slice(0, 8)}</p>
          </div>
        </div>

        <div className="relative flex-shrink-0">
          <button
            onClick={() => setMenuAberto((v) => !v)}
            className="p-1.5 text-parchment/40 hover:text-parchment hover:bg-ink-700 rounded-lg transition-all"
          >
            <MoreVertical size={16} />
          </button>
          {menuAberto && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuAberto(false)} />
              <div className="absolute right-0 top-full mt-1 w-52 bg-ink-800/50 rounded-xl border border-line shadow-xl z-20 py-1 overflow-hidden">
                <button
                  onClick={() => { onReabrir(item); setMenuAberto(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-parchment/80 hover:bg-white/5 transition-colors"
                >
                  <Eye size={14} /> Reabrir análise
                </button>
                {item.caso_id && (
                  <button
                    onClick={() => { onReanalisar(item); setMenuAberto(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-parchment/80 hover:bg-white/5 transition-colors"
                    title="Adiciona um documento novo e gera uma nova versão do parecer, sem apagar a anterior"
                  >
                    <FilePlus2 size={14} /> Adicionar documento / Reanalisar
                  </button>
                )}
                <button
                  onClick={() => { onBaixar(item); setMenuAberto(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-parchment/80 hover:bg-white/5 transition-colors"
                >
                  <Download size={14} /> Baixar parecer
                </button>
                <div className="border-t border-line my-1" />
                <button
                  onClick={() => { onExcluir(item); setMenuAberto(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={14} /> Excluir
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-bold text-parchment/40 uppercase tracking-wider">Documentos</p>
            <p className="text-sm text-parchment/80">{item.documentos_count} arquivo(s)</p>
          </div>
          {item.confianca_media != null && (
            <div>
              <p className="text-[10px] font-bold text-parchment/40 uppercase tracking-wider">Confiança média</p>
              <div className="flex items-center gap-1.5">
                <div className="w-12 h-1.5 bg-ink-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gold rounded-full" style={{ width: `${item.confianca_media}%` }} />
                </div>
                <span className="text-xs text-parchment/60">{item.confianca_media}%</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {item.tem_prescricao && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gold/10 text-gold text-xs font-medium border border-gold/25">
              <Scale size={10} /> Prescrição
            </span>
          )}
          {item.tem_decadencia && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 text-parchment/70 text-xs font-medium border border-line">
              <Clock size={10} /> Decadência
            </span>
          )}
          {!item.tem_prescricao && !item.tem_decadencia && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 text-parchment/60 text-xs font-medium border border-line">
              <AlertTriangle size={10} /> Sem prescrição/decadência
            </span>
          )}
        </div>

        <p className="text-sm text-parchment/60 leading-relaxed bg-white/5 rounded-lg p-3 line-clamp-3">
          {item.resumo}
        </p>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-1.5 text-xs text-parchment/40">
            <Calendar size={12} />
            <span>{formatarDataHora(item.created_at)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onReabrir(item)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-parchment/60 bg-ink-700 hover:bg-ink-600 rounded-lg transition-colors"
            >
              <Eye size={12} /> Reabrir
            </button>
            <button
              onClick={() => onBaixar(item)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gold bg-gold/10 hover:bg-gold/15 rounded-lg transition-colors"
            >
              <Download size={12} /> Parecer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// COMPONENTE: MODAL DE CONFIRMAÇÃO LGPD
// ============================================
const ModalLGPD = ({ aberto, onFechar, onConfirmar, tipo }) => {
  if (!aberto) return null;

  const configs = {
    excluir_item: {
      titulo: 'Excluir Análise',
      descricao: 'Esta ação removerá permanentemente esta análise do seu histórico.',
      botao: 'Sim, excluir análise',
    },
    excluir_tudo: {
      titulo: 'Excluir Todos os Meus Dados',
      descricao:
        'Esta ação é irreversível. Todos os seus dados, análises e histórico serão permanentemente removidos, conforme o art. 18, VI da LGPD.',
      botao: 'Sim, excluir todos os meus dados',
    },
  };
  const config = configs[tipo] || configs.excluir_item;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative bg-ink-800/50 rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center">
            <AlertTriangle size={24} className="text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-parchment">{config.titulo}</h3>
            <p className="text-xs text-parchment/50">Conformidade LGPD</p>
          </div>
        </div>

        <p className="text-sm text-parchment/60 leading-relaxed mb-2">{config.descricao}</p>

        <div className="flex items-start gap-2 p-3 bg-amber-500/10 rounded-lg border border-amber-500/25 mb-6">
          <Lock size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-300">
            Seus dados são protegidos pelo art. 18 da LGPD. Você tem direito ao esquecimento a qualquer momento.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onFechar}
            className="flex-1 py-2.5 text-sm font-medium text-parchment/60 bg-ink-700 hover:bg-ink-600 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            className="flex-1 py-2.5 text-sm font-semibold text-ink bg-red-500/100 hover:bg-red-600 rounded-xl shadow-lg shadow-red-600/20 transition-all"
          >
            {config.botao}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// COMPONENTE PRINCIPAL: HISTÓRICO DE RESULTADOS
// ============================================
const Historico = ({ user, onNovaAnalise, onReabrirAnalise, onReanalisar, onLogout }) => {
  const [analises, setAnalises] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroResultado, setFiltroResultado] = useState('todos');
  const [modalLGPD, setModalLGPD] = useState(null);
  const [toast, setToast] = useState(null);
  const [exportando, setExportando] = useState(false);

  const mostrarToast = (mensagem, tipo = 'sucesso') => {
    setToast({ mensagem, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  // ---- Carrega o histórico real do Supabase ----
  const carregar = useCallback(async () => {
    setCarregando(true);
    const lista = await listarAnalises(user?.id);
    setAnalises(lista);
    setCarregando(false);
  }, [user?.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const itensFiltrados = useMemo(() => {
    return analises.filter((item) => {
      const alvo = `${item.titulo} ${item.resumo}`.toLowerCase();
      const matchBusca = !busca || alvo.includes(busca.toLowerCase());
      const matchResultado =
        filtroResultado === 'todos' ||
        (filtroResultado === 'prescricao' && item.tem_prescricao) ||
        (filtroResultado === 'decadencia' && item.tem_decadencia) ||
        (filtroResultado === 'nenhum' && !item.tem_prescricao && !item.tem_decadencia);
      return matchBusca && matchResultado;
    });
  }, [analises, busca, filtroResultado]);

  const handleReabrir = (item) => onReabrirAnalise?.(item);

  // Portabilidade LGPD (art. 18, V): baixa TODAS as análises num único JSON.
  const handleExportarTudo = async () => {
    setExportando(true);
    try {
      const dados = await exportarHistorico(user?.id);
      const blob = new Blob([JSON.stringify(dados, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tributagil_historico_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      mostrarToast(`Histórico exportado (${dados.total} análise${dados.total !== 1 ? 's' : ''}).`);
    } catch (err) {
      console.error('[Historico] Falha ao exportar:', err);
      mostrarToast('Não foi possível exportar agora.', 'info');
    } finally {
      setExportando(false);
    }
  };

  const handleBaixar = (item) => {
    const conteudo = `PARECER TRIBUTÁRIO — ${item.titulo}\n\nData: ${formatarDataHora(
      item.created_at,
    )}\n\n${item.resumo}\n`;
    const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Parecer_${String(item.id).slice(0, 8)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    mostrarToast('Parecer baixado com sucesso!');
  };

  const confirmarExclusao = async () => {
    const alvo = modalLGPD;
    setModalLGPD(null);

    if (alvo?.tipo === 'excluir_item' && alvo.item) {
      // Um caso versionado (com `caso_id`) pode ter documentos compartilhados
      // entre várias versões (payload de uma reanálise inclui os antigos +
      // os novos) — apagar UMA versão não pode apagar arquivos que outras
      // versões do mesmo caso ainda referenciam. Só remove do Storage quando
      // o item não pertence a um caso versionado.
      const caminhos = alvo.item.caso_id ? [] : caminhosDocumentos(alvo.item);
      const ok = await excluirAnalise(alvo.item.id, caminhos);
      if (ok) {
        setAnalises((prev) => prev.filter((a) => a.id !== alvo.item.id));
        mostrarToast('Análise excluída.');
      } else {
        mostrarToast('Não foi possível excluir agora.', 'info');
      }
    } else {
      // Exclusão total (LGPD): agrupa por caso. `casos`, `documentos_caso` e
      // `documento_chunks` são insert-only para o cliente (proteção
      // antifraude — ver README) — a RPC `excluir_caso_completo` é a única
      // via que consegue apagá-las, e apaga o caso inteiro (todas as
      // versões) numa tacada só. Itens legados sem `caso_id` (anteriores a
      // essa migração) seguem pelo caminho antigo, item a item.
      const casoIds = [...new Set(analises.map((a) => a.caso_id).filter(Boolean))];
      const semCaso = analises.filter((a) => !a.caso_id);

      await Promise.all([
        ...casoIds.map(async (casoId) => {
          const { ok, storagePaths } = await excluirCasoCompleto(casoId);
          if (ok && storagePaths.length > 0) await removerDocumentos(storagePaths);
        }),
        ...semCaso.map((a) => excluirAnalise(a.id, caminhosDocumentos(a))),
      ]);
      setAnalises([]);
      mostrarToast('Todos os seus dados e documentos foram excluídos.', 'info');
    }
  };

  const vazio = !carregando && analises.length === 0;

  return (
    <div className="min-h-screen bg-noir">
      {toast && (
        <div
          className={`fixed top-4 right-4 left-4 sm:left-auto sm:top-6 sm:right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl ${
            toast.tipo === 'sucesso' ? 'bg-gold text-ink' : 'bg-blue-600 text-ink'
          }`}
        >
          {toast.tipo === 'sucesso' ? <CheckCircle2 size={16} /> : <Lock size={16} />}
          <span className="text-sm font-medium">{toast.mensagem}</span>
        </div>
      )}

      <header className="bg-ink-800/50 border-b border-line sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-parchment">Histórico de Resultados</h1>
            <p className="text-sm text-parchment/50 truncate">
              {user?.email ? user.email : 'Suas análises tributárias concluídas'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={carregar}
              className="shrink-0 p-2.5 text-parchment/50 hover:text-parchment hover:bg-ink-700 rounded-xl transition-all"
              title="Atualizar"
            >
              <RefreshCw size={16} className={carregando ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onNovaAnalise}
              className="cursor-gavel flex-1 sm:flex-none text-center px-4 sm:px-5 py-2.5 bg-gold hover:bg-gold-soft text-ink font-semibold rounded-xl shadow-lg shadow-[var(--shadow-gold)] transition-all text-sm whitespace-nowrap"
            >
              + Nova Análise
            </button>
            <button
              onClick={onLogout}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-parchment/50 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
              title="Sair da conta"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <div className="bg-ink-800/50 border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-parchment/40" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por título ou conteúdo..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-line bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/20 focus:border-gold/50 transition-all"
              />
            </div>
            <select
              value={filtroResultado}
              onChange={(e) => setFiltroResultado(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-line bg-ink-800/50 text-sm text-parchment/60 focus:outline-none focus:ring-2 focus:ring-gold/20"
            >
              <option value="todos">Todos os resultados</option>
              <option value="prescricao">Com prescrição</option>
              <option value="decadencia">Com decadência</option>
              <option value="nenhum">Sem prescrição/decadência</option>
            </select>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap mt-3">
            <p className="text-xs text-parchment/40">
              {carregando
                ? 'Carregando...'
                : `${itensFiltrados.length} análise${itensFiltrados.length !== 1 ? 's' : ''}`}
            </p>
            {analises.length > 0 && (
              <div className="flex items-center gap-4">
                <button
                  onClick={handleExportarTudo}
                  disabled={exportando}
                  className="flex items-center gap-1.5 text-xs text-parchment/50 hover:text-gold font-medium transition-colors disabled:opacity-50"
                  title="Baixar todas as análises em um arquivo JSON (portabilidade LGPD)"
                >
                  {exportando ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  Baixar todo o histórico
                </button>
                <button
                  onClick={() => setModalLGPD({ tipo: 'excluir_tudo' })}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
                >
                  <Trash2 size={12} /> Excluir meus dados/histórico
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 p-4 bg-gold/10 border border-gold/25 rounded-xl mb-6">
          <div className="w-10 h-10 rounded-lg bg-gold/15 flex items-center justify-center flex-shrink-0">
            <Shield size={18} className="text-gold" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gold">Seus dados estão protegidos</p>
            <p className="text-xs text-gold mt-0.5">
              Documentos e pareceres trafegam criptografados (TLS). Conforme a LGPD, você pode
              solicitar a exclusão completa a qualquer momento.
            </p>
          </div>
        </div>

        {carregando ? (
          <div className="flex flex-col items-center justify-center py-20 text-parchment/40">
            <Loader2 size={28} className="animate-spin mb-3" />
            <p className="text-sm">Carregando seu histórico...</p>
          </div>
        ) : vazio ? (
          <div className="text-center py-16">
            <FolderOpen size={48} className="text-parchment/25 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-parchment/50">Nenhuma análise ainda</h3>
            <p className="text-sm text-parchment/40 mt-1">
              Assim que você concluir uma análise, ela aparece aqui automaticamente.
            </p>
            <button
              onClick={onNovaAnalise}
              className="cursor-gavel mt-5 px-5 py-2.5 bg-gold hover:bg-gold-soft text-ink text-sm font-semibold rounded-xl transition-colors"
            >
              Criar primeira análise
            </button>
          </div>
        ) : itensFiltrados.length === 0 ? (
          <div className="text-center py-16">
            <Search size={40} className="text-parchment/25 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-parchment/40">Nada encontrado com esses filtros</h3>
            <p className="text-sm text-parchment/40 mt-1">Ajuste a busca ou o filtro de resultado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {itensFiltrados.map((item) => (
              <CardAnalise
                key={item.id}
                item={item}
                onReabrir={handleReabrir}
                onBaixar={handleBaixar}
                onReanalisar={onReanalisar}
                onExcluir={(it) => setModalLGPD({ tipo: 'excluir_item', item: it })}
              />
            ))}
          </div>
        )}
      </main>

      <ModalLGPD
        aberto={!!modalLGPD}
        onFechar={() => setModalLGPD(null)}
        onConfirmar={confirmarExclusao}
        tipo={modalLGPD?.tipo}
      />

      <RodapeLegal />
    </div>
  );
};

export default Historico;
