import { describe, expect, it } from "@jest/globals";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { LocalstackContainer } from "@testcontainers/localstack";
import { readFile } from "node:fs/promises";
import { Client, connect } from "ts-postgres";
import path from "node:path";
import { addTodo, getTodo } from ".";
import { GenericContainer, Wait } from "testcontainers";
import {
    CreateBucketCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import {
    CreateQueueCommand,
    ListQueuesCommand,
    ReceiveMessageCommand,
    SQSClient,
    SendMessageCommand,
} from "@aws-sdk/client-sqs";

import { MongoDBContainer } from "@testcontainers/mongodb";
import {
    Schema,
    disconnect as mongoDisconnect,
    model,
    connect as mongoConnect,
} from "mongoose";

describe("testcontainers", () => {
    it("generic image", async () => {
        // Example with postgresql using generic container

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
        // Example with postgresql using testcontainers module

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

    it("localstack-s3", async () => {
        // Example with bucket from localstack testcontainers module

        const Bucket = "testing";

        const container = await new LocalstackContainer().start();

        const client = new S3Client({
            endpoint: container.getConnectionUri(),
            forcePathStyle: true,
            region: "us-east-1",
            credentials: {
                accessKeyId: "test",
                secretAccessKey: "test",
            },
        });

        const createBucket = await client.send(
            new CreateBucketCommand({ Bucket })
        );

        const putObject = await client.send(
            new PutObjectCommand({
                Bucket,
                Key: "first-object.txt",
                Body: "testing",
            })
        );

        expect(putObject.$metadata.httpStatusCode).toEqual(200);

        const getObject = await client.send(
            new GetObjectCommand({ Bucket, Key: "first-object.txt" })
        );

        expect(await getObject.Body?.transformToString()).toEqual("testing");

        expect(createBucket.$metadata.httpStatusCode).toEqual(200);

        client.destroy();
    });

    it("localstack-sqs", async () => {
        // Example with sqs from localstack generic container

        // must use GenericContainer to set the image version, we need 3.X to support SQS Json responses
        const container = await new GenericContainer(
            "localstack/localstack:latest"
        )
            .withExposedPorts(4566)
            .withWaitStrategy(Wait.forLogMessage("Ready", 1))
            .withStartupTimeout(120000)
            .start();

        const client = new SQSClient({
            endpoint: `http://localhost:${container.getMappedPort(4566)}`,
            region: "us-east-1",
            credentials: {
                accessKeyId: "test",
                secretAccessKey: "test",
            },
        });

        const createQueue = await client.send(
            new CreateQueueCommand({ QueueName: "testing" })
        );

        expect(createQueue.$metadata.httpStatusCode).toEqual(200);

        const queues = await client.send(new ListQueuesCommand());

        expect(queues.$metadata.httpStatusCode).toEqual(200);
        expect(queues.QueueUrls?.length).toEqual(1);

        const sendMessage = await client.send(
            new SendMessageCommand({
                MessageBody: "testing",
                QueueUrl: queues.QueueUrls?.[0],
            })
        );

        expect(sendMessage.$metadata.httpStatusCode).toEqual(200);

        const receiveMessage = await client.send(
            new ReceiveMessageCommand({
                QueueUrl: queues.QueueUrls?.[0],
            })
        );
        const [message] =
            receiveMessage.Messages && receiveMessage.Messages.length > 0
                ? receiveMessage.Messages
                : [null];

        expect(message?.Body).toEqual("testing");

        client.destroy();
    });

    it("mongo-sqs", async () => {
        // Example with mongoose as mongo client and sqs from localstack generic container

        const mongodbContainer = await new MongoDBContainer(
            "mongo:7.0.9"
        ).start();

        interface IUser {
            name: string;
            email: string;
            avatar?: string;
        }

        const userSchema = new Schema<IUser>({
            name: { type: String, required: true },
            email: { type: String, required: true },
            avatar: String,
        });

        const User = model<IUser>("User", userSchema);

        await mongoConnect(`${mongodbContainer.getConnectionString()}`, {
            directConnection: true,
        });

        const localstack = await new GenericContainer(
            "localstack/localstack:latest"
        )
            .withExposedPorts(4566)
            .withWaitStrategy(Wait.forLogMessage("Ready", 1))
            .withStartupTimeout(120000)
            .start();

        const client = new SQSClient({
            endpoint: `http://localhost:${localstack.getMappedPort(4566)}`,
            region: "us-east-1",
            credentials: {
                accessKeyId: "test",
                secretAccessKey: "test",
            },
        });

        const createQueue = await client.send(
            new CreateQueueCommand({ QueueName: "testing" })
        );

        expect(createQueue.$metadata.httpStatusCode).toEqual(200);

        const queues = await client.send(new ListQueuesCommand());

        expect(queues.$metadata.httpStatusCode).toEqual(200);
        expect(queues.QueueUrls?.length).toEqual(1);

        const listener = User.watch().on("change", async (data) => {
            // Process insert event

            console.log(data);

            const { email, name, avatar } = data.fullDocument;

            const sendMessage = await client.send(
                new SendMessageCommand({
                    MessageBody: JSON.stringify({ email, name, avatar }),
                    QueueUrl: queues.QueueUrls?.[0],
                })
            );

            expect(sendMessage.$metadata.httpStatusCode).toEqual(200);

            return;
        });

        const testUser: IUser = {
            name: "test",
            email: "test@test.test",
            avatar: "test",
        };

        await User.create(testUser);

        const receiveMessage = await client.send(
            new ReceiveMessageCommand({
                QueueUrl: queues.QueueUrls?.[0],
                WaitTimeSeconds: 60,
            })
        );

        const [message] =
            receiveMessage.Messages && receiveMessage.Messages.length > 0
                ? receiveMessage.Messages
                : [null];

        expect(JSON.parse(message?.Body as string)).toEqual(testUser);

        await listener.close();
        client.destroy();
        await mongoDisconnect();
    });
});

async function runMigrations(client: Client) {
    // TODO: replace migration approach with some tool

    const filePath = path.join(
        path.resolve("./"),
        "migrations",
        "20240503212727_todo.sql"
    );

    const migration = (await readFile(filePath)).toString();

    await client.query(migration);
}
