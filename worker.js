/**
 * El Vestuario de Castizo
 * Cloudflare Worker
 *
 * Funciones:
 * - Sirve la aplicación mediante ASSETS.
 * - Proxea imágenes externas mediante /image-proxy.
 * - Solo permite los hosts incluidos en ALLOWED_IMAGE_HOSTS.
 */

const ALLOWED_IMAGE_HOSTS = new Set([
  // Basketball Jersey Archive
  'basketballjerseyarchive.com',
  'www.basketballjerseyarchive.com',

  // Football Kit Archive
  'footballkitarchive.com',
  'www.footballkitarchive.com',

  // eBay
  'i.ebayimg.com',

  // Blogger / Googleusercontent
  'blogger.googleusercontent.com'
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /*
     * ============================================================
     * PROXY DE IMÁGENES
     * ============================================================
     *
     * Ejemplo:
     *
     * /image-proxy?url=https%3A%2F%2Fwww.footballkitarchive.com%2Fcdn%2F...
     */

    if (url.pathname === '/image-proxy') {
      const target = url.searchParams.get('url');

      if (!target) {
        return new Response('Falta el parámetro "url".', {
          status: 400,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        });
      }

      let targetUrl;

      try {
        targetUrl = new URL(target);
      } catch {
        return new Response('URL no válida.', {
          status: 400,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        });
      }

      const hostname = targetUrl.hostname.toLowerCase();

      /*
       * Solo permitimos HTTPS.
       */
      if (targetUrl.protocol !== 'https:') {
        return new Response('Solo se permiten URLs HTTPS.', {
          status: 403,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        });
      }

      /*
       * Comprobamos que el dominio esté autorizado.
       */
      if (!ALLOWED_IMAGE_HOSTS.has(hostname)) {
        return new Response(
          `Host no permitido: ${hostname}`,
          {
            status: 403,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8'
            }
          }
        );
      }

      try {
        /*
         * Petición al servidor original.
         */
        const imageRequest = new Request(targetUrl.toString(), {
          method: 'GET',
          headers: {
            'Accept':
              'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',

            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36'
          }
        });

        const imageResponse = await fetch(imageRequest);

        if (!imageResponse.ok) {
          return new Response(
            `No se pudo obtener la imagen. HTTP ${imageResponse.status}`,
            {
              status: 502,
              headers: {
                'Content-Type': 'text/plain; charset=utf-8'
              }
            }
          );
        }

        /*
         * Construimos las cabeceras de respuesta.
         */
        const headers = new Headers();

        const contentType = imageResponse.headers.get('content-type');
        const contentLength = imageResponse.headers.get('content-length');
        const etag = imageResponse.headers.get('etag');
        const lastModified = imageResponse.headers.get('last-modified');

        if (contentType) {
          headers.set('Content-Type', contentType);
        }

        if (contentLength) {
          headers.set('Content-Length', contentLength);
        }

        if (etag) {
          headers.set('ETag', etag);
        }

        if (lastModified) {
          headers.set('Last-Modified', lastModified);
        }

        /*
         * Cache:
         * - navegador: 1 día
         * - CDN Cloudflare: 7 días
         */
        headers.set(
          'Cache-Control',
          'public, max-age=86400, s-maxage=604800'
        );

        /*
         * Permite mostrar la imagen desde nuestra web.
         */
        headers.set(
          'Access-Control-Allow-Origin',
          '*'
        );

        /*
         * Evita que el navegador interprete el contenido
         * como otra cosa distinta de una imagen.
         */
        headers.set(
          'X-Content-Type-Options',
          'nosniff'
        );

        return new Response(imageResponse.body, {
          status: 200,
          headers
        });

      } catch (error) {
        console.error(
          'Error en image-proxy:',
          error
        );

        return new Response(
          'Error obteniendo la imagen.',
          {
            status: 502,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8'
            }
          }
        );
      }
    }

    /*
     * ============================================================
     * ARCHIVOS DEL SITIO
     * ============================================================
     */

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response(
      'El Worker funciona, pero no se ha configurado la binding ASSETS.',
      {
        status: 500,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8'
        }
      }
    );
  }
};