
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
    decontextualized_query?: string;
    original_query?: string;
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
export const handleAsk = async (request: Request, env: Env, ragId: string, ctx: ExecutionContext) => {
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
        return handleStreaming(rag, params, env, ctx);
    }

    return await handleDefault(rag, params, env);

}

const joinChunks = (item: Awaited<ReturnType<AutoRAG['search']>>['data'][0]) => {
    console.log(item.content)
    return item.content.reduce((acc, curr) => {
        return acc + curr.text;
    }, '');
}

export const handleDefault = async (rag: AutoRAG, params: Params,env: Env) => {


    if (params.query) {

        const decontextualizedQuery = await decontextualize({query: params.query, prev: params.prev, ai: env.AI});

        const res = await rag.search({
            query: decontextualizedQuery,
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
                description: markdown(joinChunks(item)).substring(0, 420),
            }))
        }

        return Response.json(result);
    }

    return Response.json({
        message_type: 'error',
        message: 'No query provided',
    } satisfies MessageResponse);
}

const handleStreaming = async (rag: AutoRAG, params: Params, env:Env, ctx: ExecutionContext) => {
    console.log('handling streaming')
    const { readable, writable } = new TransformStream();
    const wrapper = new StreamingWrapper(writable);

   

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

    const streamLogic = async () => {
        try {
            // Your commented-out startup messages can go here
            // await wrapper.writeStream({ message_type: 'api_version', ... });

            await wrapper.writeStream({
                message_type: 'api_version',
                api_version: '0.0.1'

            });
            await wrapper.writeStream({
                message_type: "license",
                content: "This data is provided under MIT License. See https://opensource.org/license/mit for details.",
            });

            await wrapper.writeStream({
                message_type: "data_retention",
                content: "Data provided may be retained for up to 1 day."
            });
                    
            if (params.query) {

                const decontextualizedQuery = await decontextualize({query: params.query, prev: params.prev, ai: env.AI, stream: wrapper});
                const res = await rag.search({
                    query: decontextualizedQuery,
                });

                const result: ResultBatch = {
                    message_type: 'result_batch',
                    results: res.data.map((item) => ({
                        name: item.filename,
                        url: item.filename,
                        site: item.filename,
                        siteUrl: item.filename,
                        score: item.score,
                        description: markdown(joinChunks(item)).substring(0, 420),
                    }))
                };

                await wrapper.writeStream(result);
                
                // You can add other messages here, like a summary if needed.

            } else {
                // Handle the case where no query is provided
                await wrapper.writeStream({
                    message_type: 'error',
                    message: 'No query provided',
                } satisfies MessageResponse);
            }

            // Signal that the stream is complete
            await wrapper.writeStream({
                message_type: 'complete'
            });

        } catch (error: any) {
            console.error("Error during streaming:", error);
            // In case of an error, write an error message to the stream
            await wrapper.writeStream({
                message_type: 'error',
                message: error.message || 'An unexpected error occurred.',
            });
        } finally {
            // CRITICAL: Always close the writer to end the stream.
            await wrapper.close();
        }
    };

    // Tell the Cloudflare runtime to wait for the streaming logic to complete.
    ctx.waitUntil(streamLogic());



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


const decontextualize = async ({
    query,
    prev = [],
    ai,
    stream
}: {query: string, prev?: Array<string>; ai: Ai, stream?:StreamingWrapper}) => {

    if (prev.length === 0) return query
    try {
        const response = await ai.run('@cf/openai/gpt-oss-20b', {
            input: `
                The user is querying the site {request.site} which has {site.itemType}s.
                Rewrite the query, incorporating the context of the previous queries and answers.
                Keep the decontextualized query short and do not reference the site. 

                If the query very clearly does not reference earlier queries, 
                don't change the query. Err on the side of incorporating the context of the 
                previous queries. If you are not sure whether this is a brand new query, 
                or follow up, it is likely a follow up. Try your best to incorporate the 
                context from the previous queries.

                The user's query is: ${query}. 
                Previous queries were: ${prev}.`,
        }); 

        const newQuery = response.output.at(-1)?.content[0]?.text as string

        if (newQuery) {
            if (stream) {
                await stream.writeStream({
                    message_type: 'decontextualized_query',
                    decontextualized_query: newQuery,
                    original_query: query,
                    query_id: '',
                } satisfies MessageResponse);
            }
            

            return newQuery
        }
        
    } catch (error) {
        console.error(error)
    }

    return query;
}