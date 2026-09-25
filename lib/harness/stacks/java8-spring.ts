import * as fs from "node:fs";
import * as path from "node:path";
import { BaseStackHandler } from "./base";
import { isJava8Pom } from "../discovery";
import type { SecurityTool, DomainCheck } from "../types";

/**
 * Legacy Spring Boot 2.x on Java 8 (Maven). Same build commands as
 * java-springboot; it exists as its own stack so the reviewer loads rules that
 * accept javax.*, POJOs and RestTemplate instead of the Java 21 / Jakarta EE
 * rules, which flag the correct legacy idioms as defects. Detection precedes
 * java-springboot (see STACK_DETECTORS in ../discovery).
 */
export class Java8SpringStack extends BaseStackHandler {
	name = "java8-spring";

	detect(projectRoot: string): boolean {
		try {
			const pomPath = path.join(projectRoot, "pom.xml");
			if (!fs.existsSync(pomPath)) return false;
			return isJava8Pom(fs.readFileSync(pomPath, "utf-8"));
		} catch {
			return false;
		}
	}

	lintCmd(): string {
		return "mvn checkstyle:check";
	}
	typecheckCmd(): string {
		return "mvn compile -q";
	}
	testCmd(_files?: string[]): string {
		return "mvn test";
	}
	coverageCmd(): string {
		return "mvn jacoco:report";
	}

	securityTools(): SecurityTool[] {
		return [
			{
				name: "owasp-dependency-check",
				npmPackage: "dependency-check",
				cmd: "mvn dependency-check:check",
				outputFormat: "json",
			},
		];
	}

	domainChecks(domain: "frontend" | "backend" | "infra"): DomainCheck[] {
		if (domain === "backend") {
			return [
				{
					name: "openapi-validate",
					cmd: "mvn springdoc-openapi:generate",
					threshold: undefined,
				},
			];
		}
		return [];
	}
}
