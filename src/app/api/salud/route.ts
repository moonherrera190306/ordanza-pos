/** Lo usa el lanzador local para saber que el servidor que responde es Ordanza POS y no otra app. */
export function GET() {
  return Response.json({ app: "ordanza-pos" });
}
