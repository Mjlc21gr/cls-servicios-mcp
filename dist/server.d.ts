import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
export declare const convertSchema: {
    sourceCode: z.ZodString;
};
export declare const shellSchema: {
    appName: z.ZodString;
    remotes: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        path: z.ZodString;
        remoteEntry: z.ZodString;
        exposedModule: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        path: string;
        remoteEntry: string;
        exposedModule: string;
    }, {
        name: string;
        path: string;
        remoteEntry: string;
        exposedModule: string;
    }>, "many">;
};
export declare const moduleSchema: {
    moduleName: z.ZodString;
    components: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        path: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        path: string;
    }, {
        name: string;
        path: string;
    }>, "many">;
};
export declare function convertHandler(args: {
    sourceCode: string;
}): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
export declare function shellHandler(args: {
    appName: string;
    remotes: Array<{
        name: string;
        path: string;
        remoteEntry: string;
        exposedModule: string;
    }>;
}): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
export declare function moduleHandler(args: {
    moduleName: string;
    components: Array<{
        name: string;
        path: string;
    }>;
}): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
export declare function createServer(): McpServer;
export declare function startServer(): Promise<void>;
//# sourceMappingURL=server.d.ts.map