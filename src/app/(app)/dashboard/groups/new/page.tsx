import CreateGroupForm from "./CreateGroupForm";

export default function NewGroupPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-6">
      <h1 className="text-xl font-bold">Create Group</h1>
      <CreateGroupForm />
    </div>
  );
}
