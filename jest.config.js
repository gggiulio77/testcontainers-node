/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    testMatch: ["**/*.spec.{js,ts}"],
    transform: {
        "^.+\\.(t|j)sx?$": "@swc/jest",
    },
    testPathIgnorePatterns: ["<rootDir>/node_modules/"],
    testTimeout: 200000,
};
