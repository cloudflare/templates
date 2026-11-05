import GreetForm from "../components/GreetForm";

export default function ActionsPage() {
	return (
		<>
			<h1 className="m-0 text-4xl leading-[1.1] font-bold tracking-[-0.01em]">
				Actions
			</h1>
			<p className="mt-4 mb-8 text-lg text-ink-2">
				The form below calls actions.ts through the typed client; the Worker
				answers.
			</p>
			<section className="rounded-2xl border border-rule bg-sheet p-6">
				<GreetForm />
				<p className="mt-4 mb-0 text-[0.9375rem] text-ink-2">
					POST /_brust/action/greet. The name is checked against the schema
					first: an empty one answers 422.
				</p>
			</section>
		</>
	);
}
