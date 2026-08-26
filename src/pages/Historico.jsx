// src/pages/Historico.jsx
import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  FileText,
  Download,
  Trash2,
  RotateCcw,
  Calendar,
  Hash,
  Scale,
  ChevronRight,
  Shield,
  Lock,
  AlertTriangle,
  X,
  CheckCircle2,
  Clock,
  MoreVertical,
  FolderOpen,
  Eye
} from 'lucide-react';

// ============================================
// DADOS MOCK DO HISTÓRICO
// ============================================
const HISTORICO_MOCK = [
  {
    id: 'TRB-2026-0847',
    processo: '1002345-78.2024.8.26.0100',
    parte_autora: 'Fazenda Nacional',
    parte_reu: 'Indústria Alpha Ltda.',
    valor_causa: 'R$ 847.320,00',
    data_analise: '2026-08-26',
    hora: '14:32',
    status: 'concluido',
    documentos_count: 5,
    tem_prescricao: true,
    tem_decadencia: true,
    confianca_media: 91,
    resumo: 'Prescrição intercorrente configurada. Decadência parcial reconhecida para exercícios 2018-2019.',
  },
  {
    id: 'TRB-2026-0801',
    processo: '1001987-45.2024.8.26.0056',
    parte_autora: 'Fazenda Estadual',
    parte_reu: 'Comércio Beta ME',
    valor_causa: 'R$ 123.450,00',
    data_analise: '2026-08-20',
    hora: '09:15',
    status: 'concluido',
    documentos_count: 3,
    tem_prescricao: false,
    tem_decadencia: true,
    confianca_media: 87,
    resumo: 'Decadência total configurada. CDA inscrita após prazo decadencial de 5 anos.',
  },
  {
    id: 'TRB-2026-0756',
    processo: '1001456-12.2024.8.26.0034',
    parte_autora: 'Fazenda Nacional',
    parte_reu: 'Serviços Gamma S.A.',
    valor_causa: 'R$ 2.340.000,00',
    data_analise: '2026-08-15',
    hora: '16:45',
    status: 'concluido',
    documentos_count: 8,
    tem_prescricao: true,
    tem_decadencia: false,
    confianca_media: 94,
    resumo: 'Prescrição reconhecida. Citação ocorreu após decurso do prazo de 5 anos.',
  },
  {
    id: 'TRB-2026-0723',
    processo: '1001123-89.2024.8.26.0012',
    parte_autora: 'Fazenda Municipal',
    parte_reu: 'Restaurante Delta LTDA',
    valor_causa: 'R$ 45.600,00',
    data_analise: '2026-08-10',
    hora: '11:20',
    status: 'concluido',
    documentos_count: 2,
    tem_prescricao: false,
    tem_decadencia: false,
    confianca_media: 82,
    resumo: 'Não há prescrição nem decadência configuradas. Recomenda-se análise de mérito.',
  },
  {
    id: 'TRB-2026-0689',
    processo: '1000890-34.2024.8.26.0098',
    parte_autora: 'Fazenda Nacional',
    parte_reu: 'Transportes Epsilon EIRELI',
    valor_causa: 'R$ 567.890,00',
    data_analise: '2026-08-05',
    hora: '13:50',
    status: 'concluido',
    documentos_count: 6,
    tem_prescricao: true,
    tem_decadencia: true,
    confianca_media: 89,
    resumo: 'Prescrição e decadência configuradas. CDA renovada questionável.',
  },
];

// ============================================
// COMPONENTE: CARD DE DOSSIÊ
// ============================================
const CardDossie = ({ item, onReabrir, onBaixar, onExcluir }) => {
  const [menuAberto, setMenuAberto] = useState(false);

  const statusConfig = {
    concluido: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Concluído', icon: CheckCircle2 },
    processando: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Processando', icon: Clock },
  };

  const status = statusConfig[item.status] || statusConfig.concluido;
  const StatusIcon = status.icon;

  const formatarData = (dataStr) => {
    const [ano, mes, dia] = dataStr.split('-');
    return `${dia}/${mes}/${ano}`;
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all group">
      {/* Header do card */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
            <FolderOpen size={18} className="text-slate-500 group-hover:text-emerald-600 transition-colors" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-medium text-slate-600">{item.id}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${status.bg} ${status.text}`}>
                <StatusIcon size={10} />
                {status.label}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Processo {item.processo}</p>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setMenuAberto(!menuAberto)}
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
                  <Eye size={14} />
                  Reabrir análise
                </button>
                <button
                  onClick={() => { onBaixar(item); setMenuAberto(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Download size={14} />
                  Baixar parecer
                </button>
                <div className="border-t border-slate-100 my-1" />
                <button
                  onClick={() => { onExcluir(item); setMenuAberto(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={14} />
                  Excluir
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="px-5 py-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Parte Autora</p>
            <p className="text-sm text-slate-700 truncate">{item.parte_autora}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Parte Ré</p>
            <p className="text-sm text-slate-700 truncate">{item.parte_reu}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Valor</p>
            <p className="text-sm font-semibold text-emerald-700">{item.valor_causa}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Documentos</p>
            <p className="text-sm text-slate-700">{item.documentos_count} arquivos</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Confiança</p>
            <div className="flex items-center gap-1.5">
              <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${item.confianca_media}%` }} />
              </div>
              <span className="text-xs text-slate-600">{item.confianca_media}%</span>
            </div>
          </div>
        </div>

        {/* Tags de resultado */}
        <div className="flex items-center gap-2 flex-wrap">
          {item.tem_prescricao && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-100">
              <Scale size={10} />
              Prescrição
            </span>
          )}
          {item.tem_decadencia && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100">
              <Clock size={10} />
              Decadência
            </span>
          )}
          {!item.tem_prescricao && !item.tem_decadencia && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-50 text-slate-600 text-xs font-medium border border-slate-100">
              <AlertTriangle size={10} />
              Sem prescrição/decadência
            </span>
          )}
        </div>

        {/* Resumo */}
        <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-lg p-3">
          {item.resumo}
        </p>

        {/* Footer com data e ações rápidas */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Calendar size={12} />
            <span>{formatarData(item.data_analise)} às {item.hora}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onReabrir(item)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <Eye size={12} />
              Reabrir
            </button>
            <button
              onClick={() => onBaixar(item)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
            >
              <Download size={12} />
              Parecer
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
      descricao: 'Esta ação removerá permanentemente esta análise do seu histórico. O parecer em PDF também será excluído.',
      icone: Trash2,
      cor: 'red',
      botao: 'Sim, excluir análise',
    },
    excluir_tudo: {
      titulo: 'Excluir Todos os Meus Dados',
      descricao: 'Esta ação é irreversível. Todos os seus dados, análises, documentos enviados e histórico serão permanentemente removidos de nossos servidores, conforme o art. 18, inciso VI da LGPD.',
      icone: AlertTriangle,
      cor: 'red',
      botao: 'Sim, excluir todos os meus dados',
    },
  };

  const config = configs[tipo];
  const Icon = config.icone;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 rounded-xl bg-${config.cor}-100 flex items-center justify-center`}>
            <Icon size={24} className={`text-${config.cor}-600`} />
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
// COMPONENTE PRINCIPAL: HISTÓRICO
// ============================================
const Historico = ({ user, onNovaAnalise, onReabrirAnalise }) => {
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroResultado, setFiltroResultado] = useState('todos');
  const [modalLGPD, setModalLGPD] = useState(null);
  const [toast, setToast] = useState(null);

  const mostrarToast = (mensagem, tipo = 'sucesso') => {
    setToast({ mensagem, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  const itensFiltrados = useMemo(() => {
    return HISTORICO_MOCK.filter((item) => {
      const matchBusca = !busca ||
        item.processo.toLowerCase().includes(busca.toLowerCase()) ||
        item.parte_reu.toLowerCase().includes(busca.toLowerCase()) ||
        item.id.toLowerCase().includes(busca.toLowerCase()) ||
        item.resumo.toLowerCase().includes(busca.toLowerCase());

      const matchStatus = filtroStatus === 'todos' || item.status === filtroStatus;

      const matchResultado = filtroResultado === 'todos' ||
        (filtroResultado === 'prescricao' && item.tem_prescricao) ||
        (filtroResultado === 'decadencia' && item.tem_decadencia) ||
        (filtroResultado === 'nenhum' && !item.tem_prescricao && !item.tem_decadencia);

      return matchBusca && matchStatus && matchResultado;
    });
  }, [busca, filtroStatus, filtroResultado]);

  const handleReabrir = (item) => {
    onReabrirAnalise?.(item);
  };

  const handleBaixar = (item) => {
    // Simula download do parecer
    const conteudo = `PARECER TRIBUTÁRIO — ${item.id}\n\nProcesso: ${item.processo}\nParte Ré: ${item.parte_reu}\n\n${item.resumo}`;
    const blob = new Blob([conteudo], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Parecer_${item.id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    mostrarToast(`Parecer ${item.id} baixado com sucesso!`);
  };

  const handleExcluir = (item) => {
    setModalLGPD({ tipo: 'excluir_item', item });
  };

  const handleExcluirTudo = () => {
    setModalLGPD({ tipo: 'excluir_tudo' });
  };

  const confirmarExclusao = () => {
    if (modalLGPD.tipo === 'excluir_item') {
      mostrarToast(`Análise ${modalLGPD.item.id} excluída com sucesso.`);
    } else {
      mostrarToast('Todos os seus dados foram excluídos. Você será redirecionado.', 'info');
    }
    setModalLGPD(null);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl animate-in slide-in-from-right duration-300 ${
          toast.tipo === 'sucesso' ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'
        }`}>
          {toast.tipo === 'sucesso' ? <CheckCircle2 size={16} /> : <Lock size={16} />}
          <span className="text-sm font-medium">{toast.mensagem}</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-800">Repositório de Análises</h1>
              <p className="text-sm text-slate-500">Histórico completo de pareceres tributários</p>
            </div>
            <button
              onClick={onNovaAnalise}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/20 transition-all text-sm"
            >
              + Nova Análise
            </button>
          </div>
        </div>
      </header>

      {/* Barra de ferramentas */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Busca */}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por processo, parte, ID ou conteúdo..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>

            {/* Filtros */}
            <div className="flex items-center gap-2">
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="todos">Todos os status</option>
                <option value="concluido">Concluídos</option>
                <option value="processando">Em processamento</option>
              </select>

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
          </div>

          {/* Contador e LGPD */}
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-slate-400">
              {itensFiltrados.length} análise{itensFiltrados.length !== 1 ? 's' : ''} encontrada{itensFiltrados.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={handleExcluirTudo}
              className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
            >
              <Trash2 size={12} />
              Excluir meus dados/histórico
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Banner LGPD */}
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-xl mb-6">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Shield size={18} className="text-emerald-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-800">Seus dados estão protegidos</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              Todos os documentos e pareceres são criptografados em trânsito (TLS 1.3) e em repouso (AES-256). 
              Conforme a LGPD, você pode solicitar a exclusão completa a qualquer momento.
            </p>
          </div>
          <Lock size={16} className="text-emerald-400 flex-shrink-0" />
        </div>

        {/* Grid de dossiês */}
        {itensFiltrados.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {itensFiltrados.map((item) => (
              <CardDossie
                key={item.id}
                item={item}
                onReabrir={handleReabrir}
                onBaixar={handleBaixar}
                onExcluir={handleExcluir}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <FolderOpen size={48} className="text-slate-200 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-400">Nenhuma análise encontrada</h3>
            <p className="text-sm text-slate-400 mt-1">Tente ajustar os filtros ou busque por outro termo.</p>
          </div>
        )}
      </main>

      {/* Modal LGPD */}
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