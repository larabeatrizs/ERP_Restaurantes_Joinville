import React, { useEffect, useState } from 'react'

function App() {
  const [apiStatus, setApiStatus] = useState('Verificando conexão com a API...');

  useEffect(() => {
    // Liga o React com a nossa API do Render usando a variável que você configurou no Vercel
    fetch(`${import.meta.env.VITE_API_URL}/health`)
      .then(res => res.json())
      .then(data => setApiStatus(data.status))
      .catch(() => setApiStatus('Erro ao conectar na API. Verifique o link.'));
  }, []);

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ color: '#166534' }}>Sistema de Gestão dos Restaurantes Populares</h1>
      <p>Bem-vindo! A interface do frontend foi publicada com sucesso.</p>
      
      <div style={{ padding: '1rem', backgroundColor: '#f0fdf4', border: '1px solid #22c55e', borderRadius: '8px', marginTop: '20px' }}>
        <strong>Status da Conexão Backend:</strong> {apiStatus}
      </div>
    </div>
  )
}

export default App