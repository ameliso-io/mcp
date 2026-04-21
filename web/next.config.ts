import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/ameliso.v1.AmelisoService/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:50052'}/ameliso.v1.AmelisoService/:path*`,
      },
    ]
  },
}

export default nextConfig
