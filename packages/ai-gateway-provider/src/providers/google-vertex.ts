import { createVertex as createVertexOriginal } from '@ai-sdk/google-vertex';
import { CF_TEMP_TOKEN } from '../auth';

export const createVertex = (
  ...rest: Parameters<typeof createVertexOriginal>
) => {
  if(!rest || !rest[0]) {
    return createVertexOriginal({ googleAuthOptions: { apiKey: CF_TEMP_TOKEN } });
  }

  if(rest[0].googleAuthOptions && rest[0].googleAuthOptions.apiKey === undefined && rest[0].googleAuthOptions.credentials === undefined) {
    rest[0].googleAuthOptions.apiKey = CF_TEMP_TOKEN;
  }

  return createVertexOriginal(...rest);
}
