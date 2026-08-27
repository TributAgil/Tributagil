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
} from 'lucide-react';
import { listarAnalises, excluirAnalise } from '../lib/analises';

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
const CardAnalise = ({ item, onReabrir, onBaixar, onExcluir }) => {
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all group">
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-emerald-50 transition-colors flex-shrink-0">
            <FolderOpen size={18} className="text-slate-500 group-hover:text-emerald-600 transition-colors" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800 truncate">{item.titulo}</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 flex-shrink-0">
                <CheckCircle2 size={10} />
                Concluída
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-mono truncate">#{String(item.id).slice(0, 8)}</p>
          </div>
        </div>

        <div className="relative flex-shrink-0">
          <button
            onClick={() => setMenuAberto((v) => !v)}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
          >
            <MoreVertical size={16} />
          </button>
          {menuAberto && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuAberto(false)} />
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-slate-200 shadow-xl z-20 py-1 overflow-hidden">
                <button
                  onClick={() => { onReabrir(item); setMenuAberto(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Eye size={14} /> Reabrir análise
                </button>
                <button
                  onClick={() => { onBaixar(item); setMenuAberto(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Download size={14} /> Baixar parecer
                </button>
                <div className="border-t border-slate-100 my-1" />
                <button
                  onClick={() => { onExcluir(item); setMenuAberto(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
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
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Documentos</p>
            <p className="text-sm text-slate-700">{item.documentos_count} arquivo(s)</p>
          </div>
          {item.confianca_media != null && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Confiança média</p>
              <div className="flex items-center gap-1.5">
                <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${item.confianca_media}%` }} />
                </div>
                <span className="text-xs text-slate-600">{item.confianca_media}%</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {item.tem_prescricao && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-100">
              <Scale size={10} /> Prescrição
            </span>
          )}
          {item.tem_decadencia && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100">
              <Clock size={10} /> Decadência
            </span>
          )}
          {!item.tem_prescricao && !item.tem_decadencia && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-50 text-slate-600 text-xs font-medium border border-slate-100">
              <AlertTriangle size={10} /> Sem prescrição/decadência
            </span>
          )}
        </div>

        <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-lg p-3 line-clamp-3">
          {item.resumo}
        </p>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Calendar size={12} />
            <span>{formatarDataHora(item.created_at)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onReabrir(item)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <Eye size={12} /> Reabrir
            </button>
            <button
              onClick={() => onBaixar(item)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
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
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
            <AlertTriangle size={24} className="text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">{config.titulo}</h3>
            <p className="text-xs text-slate-500">Conformidade LGPD</p>
          </div>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed mb-2">{config.descricao}</p>

        <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-100 mb-6">
          <Lock size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700">
            Seus dados são protegidos pelo art. 18 da LGPD. Você tem direito ao esquecimento a qualquer momento.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onFechar}
            className="flex-1 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-lg shadow-red-600/20 transition-all"
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
const Historico = ({ user, onNovaAnalise, onReabrirAnalise, onLogout }) => {
  const [analises, setAnalises] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroResultado, setFiltroResultado] = useState('todos');
  const [modalLGPD, setModalLGPD] = useState(null);
  const [toast, setToast] = useState(null);

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
      const ok = await excluirAnalise(alvo.item.id);
      if (ok) {
        setAnalises((prev) => prev.filter((a) => a.id !== alvo.item.id));
        mostrarToast('Análise excluída com sucesso.');
      } else {
        mostrarToast('Não foi possível excluir agora.', 'info');
      }
    } else {
      // Exclusão total: remove uma a uma (best-effort).
      await Promise.all(analises.map((a) => excluirAnalise(a.id)));
      setAnalises([]);
      mostrarToast('Todos os seus dados foram excluídos.', 'info');
    }
  };

  const vazio = !carregando && analises.length === 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl ${
            toast.tipo === 'sucesso' ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'
          }`}
        >
          {toast.tipo === 'sucesso' ? <CheckCircle2 size={16} /> : <Lock size={16} />}
          <span className="text-sm font-medium">{toast.mensagem}</span>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Histórico de Resultados</h1>
            <p className="text-sm text-slate-500">
              {user?.email ? user.email : 'Suas análises tributárias concluídas'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={carregar}
              className="p-2.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
              title="Atualizar"
            >
              <RefreshCw size={16} className={carregando ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onNovaAnalise}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/20 transition-all text-sm"
            >
              + Nova Análise
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
              title="Sair da conta"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por título ou conteúdo..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
            <select
              value={filtroResultado}
              onChange={(e) => setFiltroResultado(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="todos">Todos os resultados</option>
              <option value="prescricao">Com prescrição</option>
              <option value="decadencia">Com decadência</option>
              <option value="nenhum">Sem prescrição/decadência</option>
            </select>
          </div>

          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-slate-400">
              {carregando
                ? 'Carregando...'
                : `${itensFiltrados.length} análise${itensFiltrados.length !== 1 ? 's' : ''}`}
            </p>
            {analises.length > 0 && (
              <button
                onClick={() => setModalLGPD({ tipo: 'excluir_tudo' })}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
              >
                <Trash2 size={12} /> Excluir meus dados/histórico
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-xl mb-6">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Shield size={18} className="text-emerald-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-800">Seus dados estão protegidos</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              Documentos e pareceres trafegam criptografados (TLS). Conforme a LGPD, você pode
              solicitar a exclusão completa a qualquer momento.
            </p>
          </div>
        </div>

        {carregando ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 size={28} className="animate-spin mb-3" />
            <p className="text-sm">Carregando seu histórico...</p>
          </div>
        ) : vazio ? (
          <div className="text-center py-16">
            <FolderOpen size={48} className="text-slate-200 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-500">Nenhuma análise ainda</h3>
            <p className="text-sm text-slate-400 mt-1">
              Assim que você concluir uma análise, ela aparece aqui automaticamente.
            </p>
            <button
              onClick={onNovaAnalise}
              className="mt-5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Criar primeira análise
            </button>
          </div>
        ) : itensFiltrados.length === 0 ? (
          <div className="text-center py-16">
            <Search size={40} className="text-slate-200 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-400">Nada encontrado com esses filtros</h3>
            <p className="text-sm text-slate-400 mt-1">Ajuste a busca ou o filtro de resultado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {itensFiltrados.map((item) => (
              <CardAnalise
                key={item.id}
                item={item}
                onReabrir={handleReabrir}
                onBaixar={handleBaixar}
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
    </div>
  );
};

export default Historico;
