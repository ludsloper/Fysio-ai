
import { useState } from "react";
import QuestionsView from "./views/QuestionsView.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function App() {
	const [apiKey, setApiKey] = useState<string>(localStorage.getItem('gemini_api_key') || 'AIzaSyDRTP15ymx_sURrOpmjiOX_5W-yHNWrykU');


	// if (!started) {
	// 	return (
	// 		<div className="max-w-xl mx-auto p-6 space-y-4">
	// 			<h1 className="text-2xl font-semibold">Fysio Intake (Lage Rug) – Agent</h1>
	// 			<p className="text-sm text-muted-foreground">Voer je Gemini API key in om te starten (client-side demo).</p>
	// 			<Input type="password" placeholder="GEMINI_API_KEY" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
	// 			<Button onClick={start} disabled={!apiKey}>Start intake</Button>
	// 		</div>
	// 	);
	// }

	return <QuestionsView apiKey={apiKey} />;
}
