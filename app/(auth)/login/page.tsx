import { login } from "../actions";

export default function Login() {
  return (
    <form action={login} className="mx-auto mt-32 flex max-w-sm flex-col gap-3">
      <h1 className="text-xl font-semibold">MGR</h1>
      <input name="email" type="email" required placeholder="Email" className="rounded border p-2" />
      <input name="password" type="password" required placeholder="Password" className="rounded border p-2" />
      <button className="rounded bg-black p-2 text-white">Sign in</button>
    </form>
  );
}
