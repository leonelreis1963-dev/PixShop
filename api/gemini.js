/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// This is a Vercel serverless function that acts as a secure proxy to the Google Gemini API.
export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const { API_KEY } = process.env;
    if (!API_KEY) {
        return response.status(500).json({ error: 'A chave de API não está configurada no servidor.' });
    }

    try {
        const { model, contents, config } = request.body;
        
        if (!model || !contents) {
            return response.status(400).json({ error: 'Campos obrigatórios ausentes: modelo e conteúdo.' });
        }

        const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
        
        // The REST API expects config parameters at the top level. We also need to remove
        // SDK-specific parameters like `responseModalities` that the REST API doesn't understand.
        const { responseModalities, ...restOfConfig } = config || {};
        
        const requestBody = {
            contents,
            ...restOfConfig
        };

        const geminiResponse = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody), // Use the correctly structured body
        });

        const responseData = await geminiResponse.json();

        if (!geminiResponse.ok) {
             console.error('Erro da API Gemini:', responseData);
             const errorDetail = responseData.error?.message || 'Ocorreu um erro com a API Gemini.';
             return response.status(geminiResponse.status).json({ error: errorDetail, details: responseData });
        }

        return response.status(200).json(responseData);

    } catch (error) {
        console.error('Erro no Proxy:', error);
        return response.status(500).json({ error: 'Ocorreu um erro interno no servidor.' });
    }
}