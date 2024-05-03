import { describe, expect, it } from "@jest/globals";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { readFile } from "node:fs/promises";
import { Client, connect } from "ts-postgres";
import path from "node:path";
import { addTodo, getTodo } from ".";
import { GenericContainer, Wait } from "testcontainers";

describe("testcontainers", () => {
    it("generic image", async () => {
        const postgresContainer = await new GenericContainer(
            "postgres:13.3-alpine"
        )
            .withExposedPorts(5432)
            .withEnvironment({
                POSTGRES_PASSWORD: "testing",
                POSTGRES_USER: "testing",
                POSTGRES_DB: "todos",
            })
            .withWaitStrategy(
                Wait.forLogMessage(
                    "database system is ready to accept connections",
                    2
                )
            )
            .withStartupTimeout(120000)
            .start();

        const client = await connect({
            user: "testing",
            password: "testing",
            database: "todos",
            port: postgresContainer.getMappedPort(5432),
            host: postgresContainer.getHost(),
        });

        await runMigrations(client);

        const id = await addTodo(client, "Search a job");

        const todo = await getTodo(client, id);

        expect(todo).toStrictEqual({
            id,
            description: "Search a job",
            done: false,
        });

        await client.end();
    });

    it("module", async () => {
        console.log("creating container");

        const postgresContainer = await new PostgreSqlContainer()
            .withDatabase("todos")
            .withPassword("testing")
            .withUsername("testing")
            .start();

        const client = await connect({
            user: postgresContainer.getUsername(),
            password: postgresContainer.getPassword(),
            database: postgresContainer.getDatabase(),
            port: postgresContainer.getPort(),
            host: postgresContainer.getHost(),
        });

        await runMigrations(client);

        const id = await addTodo(client, "Search a job");

        const todo = await getTodo(client, id);

        expect(todo).toStrictEqual({
            id,
            description: "Search a job",
            done: false,
        });

        expect(true).toBe(true);

        await client.end();
    });
});

async function runMigrations(client: Client) {
    // TODO: replace migration approach with some tool

    const filePath = path.join(
        path.resolve("./"),
        "migrations",
        "20240503212727_todo.sql"
    );

    console.log(`${filePath}`);

    const migration = (await readFile(filePath)).toString();

    console.log(`Running migration, ${migration}`);

    await client.query(migration);
}
