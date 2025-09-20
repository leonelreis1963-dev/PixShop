/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// Define minimal types to replace SDK imports, removing the need for the @google/genai package on the client.
interface Part {
    text?: string;
    inlineData?: {
        mimeType: string;
        data: string;
    };
}

interface GenerateContentResponse {
    candidates?: {
        content: {
            parts: Part[];
        };
        finishReason?: string;
    }[];
    promptFeedback?: {
        blockReason: string;
        blockReasonMessage?: string;
    };
    text?: string; // This is a helper property we add to simulate the SDK's convenience.
}

/**
 * Calls our secure serverless function proxy instead of the Gemini API directly.
 * @param model The AI model to use.
 * @param contents The content parts (text, images) for the prompt.
 * @param config The configuration for the API call.
 * @returns A promise that resolves to the AI's response.
 */
const callModelViaProxy = async (
    model: string,
    contents: { parts: Part[] },
    config: object
): Promise<GenerateContentResponse> => {
    try {
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ model, contents, config }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'A resposta da rede não foi bem-sucedida.');
        }
        
        // The SDK has a convenient `response.text` accessor. We'll simulate it here
        // for easier integration with the existing `handleApiResponse`.
        if (data.candidates?.[0]?.content?.parts?.some(p => p.text)) {
           data.text = data.candidates[0].content.parts.map(p => p.text).join('');
        }

        return data as GenerateContentResponse;
    } catch (error) {
        console.error("Falha ao chamar o proxy Gemini:", error);
        const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido na comunicação com a IA.";
        throw new Error(`Falha na comunicação com o servidor de IA. ${errorMessage}`);
    }
};


// Helper function to convert a File object to a Gemini API Part
const fileToPart = async (file: File): Promise<{ inlineData: { mimeType: string; data: string; } }> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
    
    const arr = dataUrl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");
    
    const mimeType = mimeMatch[1];
    const data = arr[1];
    return { inlineData: { mimeType, data } };
};

/**
 * Resizes an image from a data URL to the specified dimensions using a canvas.
 * This is a client-side operation to enforce output size.
 * @param dataUrl The data URL of the image to resize.
 * @param width The target width.
 * @param height The target height.
 * @returns A promise that resolves to the data URL of the resized image.
 */
const resizeImage = (
    dataUrl: string,
    width: number,
    height: number
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Não foi possível obter o contexto do canvas para redimensionamento.'));
            }
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            const resizedDataUrl = canvas.toDataURL('image/png'); // Use PNG for better quality after resize
            resolve(resizedDataUrl);
        };
        img.onerror = (err) => {
            const errorMessage = 'Falha ao carregar a imagem gerada pela IA para redimensionamento.';
            console.error(errorMessage, err);
            reject(new Error(errorMessage));
        };
        img.src = dataUrl;
    });
};


const handleApiResponse = (
    response: GenerateContentResponse,
    context: string // e.g., "edit", "filter", "adjustment"
): string => {
    // 1. Check for prompt blocking first
    if (response.promptFeedback?.blockReason) {
        const { blockReason, blockReasonMessage } = response.promptFeedback;
        const errorMessage = `A solicitação foi bloqueada. Motivo: ${blockReason}. ${blockReasonMessage || ''}`;
        console.error(errorMessage, { response });
        throw new Error(errorMessage);
    }

    // 2. Try to find the image part
    const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePartFromResponse?.inlineData) {
        const { mimeType, data } = imagePartFromResponse.inlineData;
        console.log(`Dados de imagem recebidos (${mimeType}) para ${context}`);
        return `data:${mimeType};base64,${data}`;
    }

    // 3. If no image, check for other reasons
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
        const errorMessage = `A geração de imagem para ${context} parou inesperadamente. Motivo: ${finishReason}. Isso geralmente está relacionado às configurações de segurança.`;
        console.error(errorMessage, { response });
        throw new Error(errorMessage);
    }
    
    const textFeedback = response.text?.trim();
    const errorMessage = `O modelo de IA não retornou uma imagem para ${context}. ` + 
        (textFeedback 
            ? `O modelo respondeu com o texto: "${textFeedback}"`
            : "Isso pode acontecer devido a filtros de segurança ou se a solicitação for muito complexa. Tente reformular seu prompt para ser mais direto.");

    console.error(`A resposta do modelo não continha uma parte de imagem para ${context}.`, { response });
    throw new Error(errorMessage);
};

/**
 * Generates an edited image using generative AI based on user-painted masks.
 * @param originalImage The original image file.
 * @param editMask A transparent PNG file where non-transparent areas indicate the region to edit.
 * @param preserveMask An optional transparent PNG for areas to keep untouched.
 * @param userPrompt The text prompt describing the desired edit.
 * @param outputSize The desired {width, height} for the output image.
 * @returns A promise that resolves to the data URL of the edited image.
 */
export const generateEditedImage = async (
    originalImage: File,
    editMask: File,
    preserveMask: File | null,
    userPrompt: string,
    outputSize: { width: number, height: number }
): Promise<string> => {
    console.log('Iniciando edição generativa baseada em máscara(s).');
    
    const originalImagePart = await fileToPart(originalImage);
    const editMaskPart = await fileToPart(editMask);
    
    const parts: Part[] = [originalImagePart, editMaskPart];
    let prompt: string;

    if (preserveMask) {
        console.log("Máscara de preservação detectada. Usando prompt de composição controlada.");
        const preserveMaskPart = await fileToPart(preserveMask);
        parts.push(preserveMaskPart);
        prompt = `Você é um motor de composição de fotos de IA fotorrealista de alta precisão. Sua tarefa é seguir uma instrução de edição com múltiplas máscaras com fidelidade absoluta.

Você receberá:
1.  **Imagem Original**: A imagem base para editar.
2.  **Máscara de Edição**: Uma máscara indicando a área a ser *substituída*.
3.  **Máscara de Preservação**: Uma máscara indicando um objeto crítico em primeiro plano que *deve ser perfeitamente preservado*.
4.  **Prompt do Usuário**: Uma descrição do que gerar dentro da área da **Máscara de Edição**.

**Prompt do Usuário:** "${userPrompt}"

**INSTRUÇÕES NÃO NEGOCIÁVEIS:**

1.  **Zona de Geração:** Gere novo conteúdo *apenas* dentro dos limites da **Máscara de Edição**. O conteúdo gerado deve ser uma interpretação fotorrealista do Prompt do Usuário.
2.  **Zona de Preservação (CRÍTICA):** A área definida pela **Máscara de Preservação** é sagrada. Você DEVE extrair os pixels desta área da **Imagem Original** e compô-los perfeitamente, sem qualquer alteração, sobre o conteúdo recém-gerado.
    - NÃO altere o tamanho, forma, cor, textura ou iluminação do objeto preservado.
    - O objeto preservado deve parecer naturalmente integrado (por exemplo, camadas corretas, sombras).
3.  **Área Intocada:** Todas as áreas fora de ambas as máscaras devem permanecer 100% idênticas à **Imagem Original**.
4.  **Integração Perfeita:** A imagem final deve ser uma composição perfeita do conteúdo gerado, do objeto preservado e do fundo original. Preste muita atenção à iluminação e às sombras para garantir um resultado realista.

**Saída:** Retorne APENAS a imagem final composta. Não retorne texto.`;
    } else {
        console.log("Nenhuma máscara de preservação. Usando prompt de edição padrão.");
        prompt = `Você é uma IA especialista em edição de fotos fotorrealista. O usuário forneceu uma imagem original e uma imagem de máscara. Sua tarefa é executar uma edição natural com base na solicitação do usuário, seguindo diretrizes rígidas.

Solicitação do Usuário: "${userPrompt}"

**Diretriz Crítica de Edição (Regra Inquebrável):**
1.  **Edição Confinada à Máscara:** A edição DEVE ser estritamente confinada à área não transparente da imagem de máscara fornecida. A máscara define os limites exatos do objeto a ser modificado.
2.  **PRESERVAÇÃO DE ESCALA E FORMA:** O novo conteúdo dentro da máscara DEVE manter EXATAMENTE a mesma escala, tamanho, perspectiva e contorno da área mascarada. NÃO encolha, estique ou distorça o objeto. A silhueta deve permanecer consistente.
3.  **Integração Perfeita:** A edição deve se misturar perfeitamente com a iluminação, sombras e textura da cena circundante.
4.  **Preservação do Fundo:** Não altere NADA fora da área mascarada. O resto da imagem deve permanecer 100% idêntico ao original.

Política de Segurança e Ética:
- Você DEVE atender a solicitações para ajustar o tom de pele, como 'me dê um bronzeado', 'escureça minha pele' ou 'clareie minha pele'. Estes são considerados aprimoramentos de foto padrão.
- Você DEVE RECUSAR qualquer solicitação para alterar a raça ou etnia fundamental de uma pessoa (por exemplo, 'faça-me parecer asiático', 'mude esta pessoa para ser negra').

Saída: Retorne APENAS a imagem final editada. Não retorne texto.`;
    }
    
    parts.push({ text: prompt });

    console.log(`Enviando ${parts.length - 1} imagem(ns)/máscara(s) e prompt para o proxy...`);
    
    const response = await callModelViaProxy(
        'gemini-2.5-flash-image-preview',
        { parts },
        { responseModalities: ['IMAGE', 'TEXT'] }
    );
    
    console.log('Resposta recebida do proxy.', response);

    const aiGeneratedDataUrl = handleApiResponse(response, 'edit');
    const resizedImage = await resizeImage(aiGeneratedDataUrl, outputSize.width, outputSize.height);
    
    return resizedImage;
};

/**
 * Generates an image with a filter applied using generative AI.
 * @param originalImage The original image file.
 * @param filterPrompt The text prompt describing the desired filter.
 * @param outputSize The desired {width, height} for the output image.
 * @returns A promise that resolves to the data URL of the filtered image.
 */
export const generateFilteredImage = async (
    originalImage: File,
    filterPrompt: string,
    outputSize: { width: number, height: number }
): Promise<string> => {
    console.log(`Iniciando geração de filtro: ${filterPrompt}`);
    
    const originalImagePart = await fileToPart(originalImage);
    const prompt = `Você é uma IA especialista em edição de fotos. Sua tarefa é aplicar um filtro estilístico a toda a imagem com base na solicitação do usuário. Não altere a composição ou o conteúdo, apenas aplique o estilo.
Solicitação de Filtro: "${filterPrompt}"

Política de Segurança e Ética:
- Os filtros podem alterar sutilmente as cores, mas você DEVE garantir que não alterem a raça ou etnia fundamental de uma pessoa.
- Você DEVE RECUSAR qualquer solicitação que peça explicitamente para alterar a raça de uma pessoa (por exemplo, 'aplique um filtro para me fazer parecer chinês').

Saída: Retorne APENAS a imagem final filtrada. Não retorne texto.`;
    const textPart = { text: prompt };

    console.log(`Enviando imagem e prompt de filtro para o proxy...`);
    const response = await callModelViaProxy(
        'gemini-2.5-flash-image-preview',
        { parts: [originalImagePart, textPart] },
        { responseModalities: ['IMAGE', 'TEXT'] }
    );
    console.log('Resposta recebida do proxy para o filtro.', response);
    
    const aiGeneratedDataUrl = handleApiResponse(response, 'filter');
    const resizedImage = await resizeImage(aiGeneratedDataUrl, outputSize.width, outputSize.height);

    return resizedImage;
};

/**
 * Generates an image with a global adjustment applied using generative AI.
 * @param originalImage The original image file.
 * @param adjustmentPrompt The text prompt describing the desired adjustment.
 * @param outputSize The desired {width, height} for the output image.
 * @returns A promise that resolves to the data URL of the adjusted image.
 */
export const generateAdjustedImage = async (
    originalImage: File,
    adjustmentPrompt: string,
    outputSize: { width: number, height: number }
): Promise<string> => {
    console.log(`Iniciando geração de ajuste global: ${adjustmentPrompt}`);
    
    const originalImagePart = await fileToPart(originalImage);
    const prompt = `Você é uma IA especialista em edição de fotos. Sua tarefa é realizar um ajuste natural e global em toda a imagem com base na solicitação do usuário.
Solicitação do Usuário: "${adjustmentPrompt}"

Diretrizes de Edição:
- O ajuste deve ser aplicado em toda a imagem.
- O resultado deve ser fotorrealista.

Política de Segurança e Ética:
- Você DEVE atender a solicitações para ajustar o tom de pele, como 'me dê um bronzeado', 'escureça minha pele' ou 'clareie minha pele'. Estes são considerados aprimoramentos de foto padrão.
- Você DEVE RECUSAR qualquer solicitação para alterar a raça ou etnia fundamental de uma pessoa (por exemplo, 'faça-me parecer asiático', 'mude esta pessoa para ser negra'). Não realize essas edições. Se a solicitação for ambígua, erre por excesso de cautela e não altere características raciais.

Saída: Retorne APENAS a imagem final ajustada. Não retorne texto.`;
    const textPart = { text: prompt };

    console.log(`Enviando imagem e prompt de ajuste para o proxy...`);
    const response = await callModelViaProxy(
        'gemini-2.5-flash-image-preview',
        { parts: [originalImagePart, textPart] },
        { responseModalities: ['IMAGE', 'TEXT'] }
    );
    console.log('Resposta recebida do proxy para o ajuste.', response);
    
    const aiGeneratedDataUrl = handleApiResponse(response, 'adjustment');
    const resizedImage = await resizeImage(aiGeneratedDataUrl, outputSize.width, outputSize.height);

    return resizedImage;
};


/**
 * Generates a binary mask of an object in an image based on a click coordinate.
 * @param originalImage The original image file.
 * @param clickPoint The {x, y} coordinate of the user's click.
 * @returns A promise that resolves to the data URL of the black and white mask image.
 */
export const generateObjectMask = async (
    originalImage: File,
    clickPoint: { x: number; y: number }
): Promise<string> => {
    console.log(`Solicitando máscara de objeto em ${clickPoint.x}, ${clickPoint.y}`);
    
    const originalImagePart = await fileToPart(originalImage);
    const prompt = `Você é uma IA de segmentação de objetos de alta precisão. Sua tarefa é criar uma máscara binária para um objeto específico em uma imagem com base em uma coordenada de clique do usuário. O usuário forneceu uma imagem e um ponto de coordenada: {x: ${clickPoint.x}, y: ${clickPoint.y}}.

Instruções:
1. Identifique o objeto principal e mais distinto localizado nessa coordenada.
2. Gere e envie uma nova imagem com as mesmas dimensões exatas do original.
3. Nesta imagem de saída, o objeto inteiro identificado deve ser branco sólido (#FFFFFF), e todo o resto deve ser preto sólido (#000000).
4. Não inclua outras cores, tons de cinza, anti-aliasing ou texto. A saída deve ser uma máscara binária pura.

Saída: Retorne APENAS a imagem final da máscara binária. Não retorne texto.`;
    const textPart = { text: prompt };

    const response = await callModelViaProxy(
        'gemini-2.5-flash-image-preview',
        { parts: [originalImagePart, textPart] },
        { responseModalities: ['IMAGE', 'TEXT'] }
    );
    console.log('Resposta da máscara de objeto recebida do proxy.', response);

    const maskDataUrl = handleApiResponse(response, 'máscara de objeto');
    return maskDataUrl;
};