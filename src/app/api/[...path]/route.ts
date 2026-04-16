import { NextRequest } from 'next/server';
import { handleApiRequest } from '@/src/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

const getPath = async (context: RouteContext) => {
  const params = await context.params;
  return params.path || [];
};

export async function GET(req: NextRequest, context: RouteContext) {
  return handleApiRequest(req, await getPath(context));
}

export async function POST(req: NextRequest, context: RouteContext) {
  return handleApiRequest(req, await getPath(context));
}

export async function PUT(req: NextRequest, context: RouteContext) {
  return handleApiRequest(req, await getPath(context));
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  return handleApiRequest(req, await getPath(context));
}
