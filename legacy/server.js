require('dotenv').config();
const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { marked } = require('marked');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static('public'));

// Função para gerar o Relatório PDF
async function gerarRelatorioPDF(content) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    });

    const page = await browser.newPage();
    const htmlContent = marked(content);

    await page.setContent(`
    <html>
      <head>
        <style>
          body {
            font-family: 'Poppins', sans-serif;
            padding: 60px 70px;
            color: #333;
            line-height: 1.6;
          }
          h1 {
            color: #ff5722;
            margin-bottom: 30px;
            text-align: center;
          }
          h2 {
            color: #e64a19;
            margin-top: 40px;
            margin-bottom: 20px;
          }
          p, ul, li {
            margin-bottom: 12px;
          }
          footer {
            font-size: 10px;
            color: #888;
            text-align: center;
            margin-top: 60px;
          }
        </style>
      </head>
      <body>
        <div style="text-align: center;">
          <img src="https://yt3.googleusercontent.com/oyoWCH7tEoR6Jy2HarZ2XvHnbmrh1vEdaPugnUBgyq-JKuA6gxU3csSoUYA2ur78Obs4YZ4AzQ=w1060-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj" style="width: 100%; margin-bottom: 20px;">
          <h1>Relatório de Otimização de Anúncios - Onicanal</h1>
        </div>
        ${htmlContent}
        <footer>Relatório gerado automaticamente pelo sistema Onicanal</footer>
      </body>
    </html>
    `);

    const dir = path.join(__dirname, 'public', 'relatorios');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const filename = `relatorio-${Date.now()}.pdf`;
    const filepath = path.join(dir, filename);

    await page.pdf({ path: filepath, format: 'A4', printBackground: true });
    await browser.close();

    return `/relatorios/${filename}`;
}

// Rota para análise dos anúncios
app.post('/analisar-anuncios', async (req, res) => {
    const { anuncios } = req.body;

    const prompt = `
Você é um especialista em criação de anúncios de alta conversão para o Mercado Livre.

Baseado nos anúncios abaixo:
${anuncios.join('\n')}

Crie um relatório premium com as seguintes seções:

1. Títulos Otimizados:
Crie 5 opções de títulos com no máximo 60 caracteres cada.  
Use termos pesquisáveis como tipo de produto, material, aplicação e medidas.  
NÃO use adjetivos genéricos como "eficiente", "prático", "seguro", "moderno", "inclusivo".

2. Palavras-chave:
Liste 5 palavras principais (essenciais) e 10 secundárias (apoio SEO).

3. Descrição Detalhada:
Monte uma descrição ultra completa do produto, incluindo:
- Especificações reais coletadas dos anúncios e complementadas com a internet
- Aplicações
- Compatibilidades
- Vantagens técnicas
- Materiais
- Dimensões
- Principais diferenciais do produtos

4. Análise de Imagens e Sugestões:
Avalie as imagens e sugira 5 melhorias práticas.

5. Categoria Ideal para Publicação:
Sugira a melhor categoria para publicar o produto no Mercado Livre.

6. Perguntas Frequentes:
Liste 10 perguntas e respostas comuns para aumentar conversão.

7. Dicas de Ouro:
Principais pontos de melhoria nos anúncios enviados, para otimizar vendas e aumentar conversão.

Estilo de escrita:
- Profissional, direto e amigável
- Sem mencionar IA
- Priorizando informações reais e relevantes
- Focada em vendas e palavras chave (SEO)
`;

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5,
            max_tokens: 3500
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const gptResponse = response.data.choices[0].message.content;
        const htmlContent = marked(gptResponse);
        const pdfPath = await gerarRelatorioPDF(gptResponse);

        res.json({
            resultado: htmlContent,
            pdfPath: pdfPath.replace('public', '')
        });
    } catch (error) {
        console.error('Erro completo:', error.response ? error.response.data : error.message);
        res.status(500).send('Erro ao processar a análise.');
    }
});

// Fazendo o servidor rodar
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});