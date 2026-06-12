// app/api/incidents/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";


const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://proyecto-cloud-pi.vercel.app",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("incidents")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }

  return NextResponse.json({ incidents: data }, { headers: CORS_HEADERS });
}