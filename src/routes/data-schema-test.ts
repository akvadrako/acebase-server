import { ISchemaCheckResult, SchemaDefinition, Transport } from 'acebase-core';
import type { IAceBaseSchemaInfo } from 'acebase-core/src/api';
import type { SerializedValue } from 'acebase-core/types/transport';
import { RouteInitEnvironment, RouteRequest } from '../shared/env';
import { sendError, sendUnauthorizedError } from '../shared/error';

export type RequestQuery = null;
export type RequestBody = { 
    value: SerializedValue; 
    partial: boolean; 
    path?: string;
    schema?: IAceBaseSchemaInfo 
};
export type ResponseBody = ISchemaCheckResult       // 200
    | { code: 'admin_only'; message: string }       // 403
    | { code: 'unexpected'; message: string };      // 500

export type Request = RouteRequest<any, ResponseBody, RequestBody, RequestQuery>;

export const addRoute = (env: RouteInitEnvironment) => {

    env.app.post(`/schema/${env.db.name}/test`, async (req: Request, res) => {
        // tests a schema
        if (!req.user || req.user.username !== 'admin') {
            return sendUnauthorizedError(res, 'admin_only', 'only admin can perform schema operations');
        }

        try {
            const data = req.body;
            if (typeof data.value?.val === 'undefined' || !['string','object','undefined'].includes(typeof data.value?.map)) {
                return sendError(res, { code: 'invalid_serialized_value', message: 'The sent value is not properly serialized' });
            }
            const value = Transport.deserialize(data.value);
            const { path, schema, partial } = data;
            let result: ISchemaCheckResult;
            if (schema) {
                const definition = new SchemaDefinition(schema);
                result = definition.check(path, value, partial);
            }
            else {
                result = await env.db.schema.check(path, schema, partial);
            }

            res.contentType('application/json').send(result);
        }
        catch(err) {
            sendError(res, err);
        }
    });    

};

export default addRoute;