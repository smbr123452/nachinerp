type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const showError = params.error === "invalid" || params.error === "missing";

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">Нэвтрэх</h1>
        <p className="mb-6 text-sm text-neutral-600">ERP системд нэвтрэх мэдээллээ оруулна уу.</p>
        {showError ? (
          <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Нэвтрэх мэдээлэл буруу байна.
          </p>
        ) : null}

        <form className="space-y-4" method="post" action="/api/auth/login">
          <div className="space-y-1">
            <label htmlFor="username" className="block text-sm font-medium">
              Хэрэглэгчийн нэр
            </label>
            <input
              id="username"
              name="username"
              required
              className="w-full rounded border px-3 py-2 text-sm outline-none focus:border-black"
              placeholder="Жишээ: admin"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm font-medium">
              Нууц үг
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full rounded border px-3 py-2 text-sm outline-none focus:border-black"
            />
          </div>

          <button type="submit" className="w-full rounded bg-black px-4 py-2 text-sm font-medium text-white">
            Нэвтрэх
          </button>
        </form>
      </div>
    </main>
  );
}

