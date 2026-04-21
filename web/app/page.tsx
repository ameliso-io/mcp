import { redirect } from 'next/navigation'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ installation_id?: string }>
}) {
  const { installation_id } = await searchParams
  if (installation_id) {
    redirect(`/repositories?installation_id=${installation_id}`)
  }
  redirect('/overview')
}
