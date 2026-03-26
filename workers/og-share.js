export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'POST' && path === '/share') {
      const id = crypto.randomUUID().slice(0, 8);
      const img = await request.arrayBuffer();
      await env.R2.put(`${id}.png`, img, {
        httpMetadata: { contentType: 'image/png' },
        customMetadata: { expires: String(Date.now() + 7 * 86400 * 1000) }
      });
      return Response.json({ url: `https://keyid.app/c/${id}` });
    }

    const m = path.match(/^\/c\/([a-z0-9-]+)$/);
    if (m) {
      const id = m[1];
      return new Response(
        `<!DOCTYPE html><html><head>
        <meta charset="utf-8">
        <meta property="og:title" content="KeyID 디지털 신원">
        <meta property="og:image" content="https://keyid.app/c/${id}.png">
        <meta property="og:description" content="KeyID — 디지털 신원 인증서">
        <meta name="twitter:card" content="summary_large_image">
        <script>location.href="keyid://import?sid=${id}";setTimeout(()=>location.href="https://keyid.app",1500);<\/script>
        </head><body></body></html>`,
        { headers: { 'Content-Type': 'text/html;charset=utf-8' } }
      );
    }

    const mi = path.match(/^\/c\/([a-z0-9-]+)\.png$/);
    if (mi) {
      const obj = await env.R2.get(`${mi[1]}.png`);
      if (!obj) return new Response('Not found', { status: 404 });
      return new Response(obj.body, {
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' }
      });
    }

    return new Response('Not found', { status: 404 });
  }
};
