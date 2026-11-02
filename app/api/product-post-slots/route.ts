import {
  getJayShakthiOrderFormSlotsForUrl,
  isJayShakthiOrderFormUrl,
} from "../../_lib/order-form-slots";

export async function GET(request: Request) {
  const requestedUrl = new URL(request.url).searchParams.get("url");

  if (
    !requestedUrl ||
    requestedUrl.length > 2048 ||
    !isJayShakthiOrderFormUrl(requestedUrl)
  ) {
    return Response.json(
      { error: "A supported order-form URL is required." },
      { status: 400 },
    );
  }

  const slots = await getJayShakthiOrderFormSlotsForUrl(requestedUrl);

  return Response.json(
    { slots },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
