import mongoose from 'mongoose';

let connected = false;

export function isDbConnected(): boolean {
  return connected && mongoose.connection.readyState === 1;
}

/**
 * Conecta a MongoDB probando la URI configurada. Si falla, el servidor sigue
 * funcionando (la vectorización no depende de la base); el historial queda
 * deshabilitado y se avisa por consola.
 */
export async function connectDb(uris: string[]): Promise<string | null> {
  for (const uri of uris) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
      connected = true;
      const redacted = uri.replace(/\/\/([^@/]+)@/, '//***@');
      console.log(`[db] Conectado a MongoDB: ${redacted}`);
      return uri;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[db] No se pudo conectar con ${uri.replace(/\/\/([^@/]+)@/, '//***@')}: ${msg}`);
    }
  }
  console.warn('[db] Historial deshabilitado: sin conexión a MongoDB.');
  return null;
}
