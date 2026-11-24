import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Logique pure (protocole, sécurité, pilotage, recettes, recherche) : testable sans Android.
plugins {
    id("org.jetbrains.kotlin.jvm")
}

java {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_11) }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}

tasks.test {
    // TwinIntegrationTest s'exécute seulement si tools/twin.py tourne (sinon ignoré).
    testLogging { events("passed", "skipped", "failed") }
    // I18nTest lit les textes de l'appli (app/src/main) : les compter comme entrées, sinon le test
    // reste « à jour » quand seule l'appli change et des textes orphelins passent inaperçus.
    inputs.dir("../app/src/main").withPropertyName("appSources")
}
