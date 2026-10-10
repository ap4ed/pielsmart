# Cómo subir PielSmart a Pinterest

Tiempo estimado: 30–45 minutos. Solo necesitas hacerlo una vez.

---

## Paso 1 — Crear cuenta de Pinterest Business (5 min)

1. Ve a pinterest.com/business/create
2. Crea con el email de PielSmart (o convierte una cuenta personal existente)
3. Nombre del perfil: **PielSmart**
4. Descripción: *Guías de belleza editoriales: skincare, maquillaje, cabello, uñas y perfumes. Recomendaciones reales, precios actualizados.*
5. Website: `https://pielsmart.com`
6. Verifica el website (Pinterest te da un meta tag — pídele a Claude que lo agregue a tu Astro config)

---

## Paso 2 — Crear los 6 tableros (10 min)

Crea estos tableros en orden. Los nombres deben ser **exactamente** estos:

1. `Skincare | Cuidado de Piel`
2. `Maquillaje`
3. `Cabello`
4. `Uñas`
5. `Perfumes`
6. `Dispositivos de Belleza`

Para cada uno, copia la descripción del archivo `boards.md`.
Pon todos los tableros como **Público**.

---

## Paso 3 — Subir los 24 pins con el CSV (10 min)

Pinterest tiene una herramienta de carga masiva:

1. Ve a: `pinterest.com/pin-builder/bulk-create`
   (o: Pinterest → Crear → Crear varios Pines)
2. Selecciona **"Subir archivo CSV"**
3. Sube el archivo `pins.csv` de esta carpeta
4. Pinterest te mostrará una vista previa de los 24 pins
5. Revisa que cada pin tenga imagen, link y tablero correcto
6. Haz clic en **Publicar**

---

## Paso 4 — Programar pines nuevos (mensual)

Cada vez que publiques un artículo nuevo en PielSmart:
- Agrega una fila nueva al `pins.csv` con los datos del artículo
- Sube solo esa fila nueva a Pinterest

O crea el pin manualmente: imagen del artículo + título + link.

---

## Notas importantes

- **No pongas todos los pines en el mismo día**: Pinterest puede limitar cuentas nuevas si suben 24 pines de golpe. Si el bulk upload falla, divide en 2 días (12 pines cada uno).
- **Pinterest tarda 2–3 semanas en indexar** los pines nuevos en Google. No esperes tráfico inmediato.
- **Las imágenes son de Pexels** (licencia comercial libre) — no hay problema de derechos.
- El CSV ya tiene los hashtags dentro de la descripción de cada pin.
