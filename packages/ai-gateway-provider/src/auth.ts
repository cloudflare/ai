export const CF_TEMP_TOKEN = 'CF_TEMP_TOKEN';


type HasApiKey = { apiKey: string };

export function authWrapper<
  Func extends (config?: HasApiKey) => any
>(
  func: Func
): (
  config: Parameters<Func>[0],
) => ReturnType<Func> {
  return (config) => {
    if(!config) {
      return func({ apiKey: CF_TEMP_TOKEN });
    }
    if(config.apiKey === undefined) {
      config.apiKey = CF_TEMP_TOKEN;
    }
    return func(config);
  };
}