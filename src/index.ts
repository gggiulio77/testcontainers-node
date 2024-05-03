import { Client } from "ts-postgres";

export interface Todo {
    id: number;
    description: string;
    done: boolean;
}

export async function addTodo(
    client: Client,
    description: string
): Promise<Todo["id"]> {
    const result = await client
        .query<{ id: Todo["id"] }>(
            "INSERT INTO todos (description) VALUES ($1) RETURNING id",
            [description]
        )
        .first();

    if (!result) {
        throw new Error("Something went wrong");
    } else {
        return result.id;
    }
}

export async function getTodo(client: Client, id: number): Promise<Todo> {
    const result = await client
        .query<Todo>("SELECT id, description, done FROM todos WHERE id = $1", [
            id,
        ])
        .first();

    if (!result) {
        throw new Error("Something went wrong");
    } else {
        return result;
    }
}
