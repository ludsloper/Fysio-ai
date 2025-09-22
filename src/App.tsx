
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import AllQuestionsView from "./views/AllQuestionsView.tsx";

export default function App() {
	const [password, setPassword] = useState("");
	const [apiKey, setApiKey] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function submitPassword() {
		setError(null);
		setLoading(true);
		try {
			const res = await fetch("https://api.fynlo.nl/get_g_token", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ input: password }),
			});
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text || `Request failed (${res.status})`);
			}
			const data = (await res.json()) as { token?: string };
			if (!data.token) throw new Error("Ongeldig antwoord van server");
			setApiKey(data.token);
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Onbekende fout";
			setError(msg);
		} finally {
			setLoading(false);
		}
	}

	if (!apiKey) {
		return (
			<div className="min-h-screen grid place-items-center p-4">
				<Card className="w-full max-w-sm p-6 space-y-4">
					<div>
						<h1 className="text-xl font-semibold">Fysio Intake – Toegang</h1>
						<p className="text-sm text-muted-foreground">Voer wachtwoord in om te starten.</p>
					</div>
					<div className="space-y-2">
						<Input
							type="password"
							placeholder="Wachtwoord"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") submitPassword();
							}}
						/>
						{error && <div className="text-sm text-red-600">{error}</div>}
					</div>
					<Button onClick={submitPassword} disabled={!password || loading} className="w-full">
						{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						Doorgaan
					</Button>
				</Card>
			</div>
		);
	}

	return <AllQuestionsView apiKey={apiKey} />;
}
