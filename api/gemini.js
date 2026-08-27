export default async function handler(req, res) {
  // Apenas aceitamos requisições do tipo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { prompt } = req.body;
    
    // Pegamos a chave segura guardada nas configurações da Vercel
    const apiKey = process.env.GEMINI_API_KEY;

    // Fazemos a requisição para o Google direto do servidor da Vercel (ninguém vê)
    const googleResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await googleResponse.json();
    
    // Retornamos a resposta da IA para o seu frontend
    return res.status(200).json(data);
    
  } catch (error) {
    console.error("Erro na API do Gemini:", error);
    return res.status(500).json({ error: 'Falha ao conectar com a IA' });
  }
}