import { handleApi } from '../../server/app';
import type { Env } from '../../server/store';

export const onRequest: PagesFunction<Env> = (context) => handleApi(context.request, context.env);
