import { WinstonModule, utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';

import { asyncLocalStorage } from './async-storage';

const requestIdFormatter = winston.format((info) => {
  const store = asyncLocalStorage.getStore();
  if (store?.requestId) {
    info.requestId = store.requestId; 
  }
  return info;
});

export const winstonLogger = WinstonModule.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        requestIdFormatter(), 
        winston.format.timestamp({ format: 'DD/MM/YYYY HH:mm:ss' }),
        
        process.env.NODE_ENV == 'development' 
          ? nestWinstonModuleUtilities.format.nestLike('CommerceCore', {
              colors: true,
              prettyPrint: true,
            })
          : winston.format.json(), 
      ),
    }),
  ],
});
