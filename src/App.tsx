
import { useState } from "react";
import AllQuestionsView from "./views/AllQuestionsView";
import { Button } from "@/components/ui/button";

export default function App() {

	



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

		return <AllQuestionsView />;
}
