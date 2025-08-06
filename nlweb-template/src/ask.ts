
import markdown from 'markdown-to-text'
type Params = {
    query?: string;
    site?: string | string[];
    generate_mode?: 'list' | 'summarize' | 'generate' | 'none';
    streaming?: boolean;
    prev?: string[];
    last_ans?: {title: string; url: string}[];
    item_to_remember?: string;
    model?: string;
    oauth_id?: string;
    thread_id?: string;
    display_mode?: 'full' | (string & {});
}

type MessageResponse = {
    message_type: 
        | 'api_version'
        | 'query_analysis'
        | 'decontextualized_query'
        | 'remember'
        | 'asking_sites'
        | 'result_batch'
        | 'summary'
        | 'nlws'
        | 'ensemble_result'
        | 'chart_result'
        | 'results_map'
        | 'intermediate_message'
        | 'complete'
        | 'license'
        | 'data_retention'
        | 'error';
    query_id?: string;
    api_version?: string;
    message?: string;
    license?: string;
    content?: string;
    results?: any[];
    answer?: string;
    items?: any[];
    html?: string;
    locations?: {title: string; address: string}[];
}

type LicenseMessage = {
    message_type: 'license';
    content: string;
    query_id?: string;
}

type DataRetention = {
  message_type: "data_retention",
  content: "Data provided may be retained for up to 1 day.",

}


type ResultBatch = {
    
  message_type: "result_batch",
  results: {
      url?: string,
      name?: string,
      site?: string,
      siteUrl?: string,
      score?: number,
      description?:string,
      schema_object?: any
      ranking_type?: string
    }[],
    query_id?: string

}
type ResultMap =   {
    message_type: 'results_map';
    results: {
      url?: string,
      name?: string,
      site?: string,
      siteUrl?: string,
      score?: number,
      description?:string,
      schema_object?: any
      ranking_type?: string
    }[],
    query_id?: string
}

// mode : list, summarize, generate, none
export const handleAsk = async (request: Request, env: Env, ragId: string) => {
    const url = new URL(request.url);
    let params = Object.fromEntries(url.searchParams) as Params;

    if (request.method === 'POST') {
        try {
            const contentType = request.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const bodyData = await request.json();
                params = bodyData as Params;
            } else if (contentType.includes('application/x-www-form-urlencoded')) {
                const formData = await request.formData();
                params = Object.fromEntries(formData) as Params;
            }
        } catch (e: any) {
           console.warn(`Failed to parse POST body: ${e.message}`);
        }
    }

    const rag = env.AI.autorag(ragId);



    if (params.streaming || request.headers.get('accept') === 'text/event-stream') {
        return await handleStreaming(rag, params);
    }

    return await handleDefault(rag, params);

}

const joinChunks = (item: Awaited<ReturnType<AutoRAG['search']>>['data'][0]) => {
    console.log(item.content)
    return item.content.reduce((acc, curr) => {
        return acc + curr.text;
    }, '');
}

export const handleDefault = async (rag: AutoRAG, params: Params) => {
    console.log(params)

    if (params.query) {

        const res = await rag.search({
            query: params.query,
            // rewrite_query: params.prev
        })

        const result: ResultBatch = {
            message_type: 'result_batch',
            results:  res.data.map((item) => ({
                name: item.filename,
                url: item.filename,
                site: item.filename,
                siteUrl: item.filename,
                score: item.score,
                description: markdown(joinChunks(item)),
                // schema_object: {
                //     "@context": "https://schema.org",
                //     "@id": item.file_id,
                //     "@type": "Recipe",
                //     "additionalType": "http://www.productontology.org/id/Racing_bicycle",
                //     "description": "ACME Racing Bike, bought 8/2008, almost new, with a signature of Eddy Merckx on the frame.",
                //     "name": "ACME Racing Bike in black (2008)"
                // }
            }))
        }

        return Response.json(result);
    }

    return Response.json({
        message_type: 'error',
        message: 'No query provided',
    } satisfies MessageResponse);
}

const handleStreaming = (rag: AutoRAG, params: Params) => {
    console.log('handling streaming')
    const { readable, writable } = new TransformStream();
    const wrapper = new StreamingWrapper(writable);

    wrapper.writeStream({
        message_type: 'api_version',
        api_version: '0.0.1'

    }).then();
    wrapper.writeStream({
        message_type: "license",
        content: "This data is provided under MIT License. See https://opensource.org/license/mit for details.",
    }).then();

    wrapper.writeStream({
        message_type: "data_retention",
        content: "Data provided may be retained for up to 1 day."
    }).then();


    // {
    // "message_type": "decontextualized_query",
    // "decontextualized_query": "What is the last episode of Items?",
    // "original_query": "last episode",
    // "query_id": ""
    // }

    //     {
    //   "message_type": "tool_selection",
    //   "selected_tool": "search",
    //   "score": 10,
    //   "parameters": {
    //     "score": 10,
    //     "search_query": "Items last episode"
    //   },
    //   "query": "What is the last episode of Items?",
    //   "time_elapsed": "2.903s",
    //   "query_id": ""
    // }

    if (params.query) {

        rag.search({
            query: params.query,
            // rewrite_query: params.prev
        }).then(async (res) => {

        console.log({res})
            const result: ResultBatch = {
                message_type: 'result_batch',
                results:  res.data.map((item) => ({
                    name: item.filename,
                    url: item.filename,
                    site: item.filename,
                    siteUrl: item.filename,
                    score: item.score,
                    description: markdown(joinChunks(item)),
                    // schema_object: {
                    //     "@context": "https://schema.org",
                    //     "@id": item.file_id,
                    //     "@type": "Recipe",
                    //     "additionalType": "http://www.productontology.org/id/Racing_bicycle",
                    //     "description": "ACME Racing Bike, bought 8/2008, almost new, with a signature of Eddy Merckx on the frame.",
                    //     "name": "ACME Racing Bike in black (2008)"
                    // }
                }))
            }

            await wrapper.writeStream(result);
            await wrapper.writeStream({
                message_type: 'complete'
            })
            await wrapper.close();
            
        })

        
    }



    // await wrapper.writeStream({
    //     message_type: 'error',
    //     message: 'No query provided',
    // } satisfies MessageResponse);
    // await wrapper.close();

    return new Response(readable, {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}


class StreamingWrapper {
    private writer: WritableStreamDefaultWriter<Uint8Array>;
    private encoder: TextEncoder;

    constructor(writable: WritableStream<Uint8Array>) {
        this.writer = writable.getWriter();
        this.encoder = new TextEncoder();
    }

    /**
     * Writes a JSON object to the SSE stream.
     * @param data The JSON data to send.
     */
    async writeStream(data: MessageResponse): Promise<void> {
        const sseFormattedString = `data: ${JSON.stringify(data)}\n\n`;
        await this.writer.write(this.encoder.encode(sseFormattedString));
    }
    /**
     * Closes the stream.
     */
    async close(): Promise<void> {
        await this.writer.close();
    }
}