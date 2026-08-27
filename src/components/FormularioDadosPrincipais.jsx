import React from 'react';

export function FormularioDadosPrincipais({ dados, setDados }) {
  const handleChange = (e) => {
    const { name, value } = e.target;
    setDados((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
      <h3 className="text-base font-semibold text-slate-800 mb-4">1. Identificação do Processo</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Sujeito Ativo (Fisco/Credor)</label>
          <input
            type="text"
            name="sujeitoAtivo"
            value={dados.sujeitoAtivo}
            onChange={handleChange}
            placeholder="Ex: Fazenda Nacional / Município"
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition-all"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Sujeito Passivo (Contribuinte)</label>
          <input
            type="text"
            name="sujeitoPassivo"
            value={dados.sujeitoPassivo}
            onChange={handleChange}
            placeholder="Ex: Nome da Empresa ou CPF/CNPJ"
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition-all"
          />
        </div>
      </div>
    </div>
  );
}