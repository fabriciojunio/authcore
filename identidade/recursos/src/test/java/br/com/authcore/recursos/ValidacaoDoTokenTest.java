package br.com.authcore.recursos;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.PlainJWT;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Validação de token com a configuração de produção, sem atalho.
 *
 * <p>O teste sobe um JWKS local com uma chave RSA própria, como o Keycloak
 * faria, e assina tokens de verdade. Cada recusa abaixo é o decodificador do
 * Spring barrando o ataque, e não um mock dizendo que barrou.
 */
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Validação do token do Keycloak")
class ValidacaoDoTokenTest {

    static final String EMISSOR = "http://localhost:8180/realms/authcore";
    static final String AUDIENCIA = "authcore-recursos";
    static final RSAKey CHAVE = gerarChave("chave-do-keycloak");
    static final RSAKey OUTRA_CHAVE = gerarChave("chave-do-keycloak");
    static final HttpServer JWKS = subirJwks();

    @Autowired
    MockMvc mvc;

    @DynamicPropertySource
    static void propriedades(DynamicPropertyRegistry registro) {
        registro.add("spring.security.oauth2.resourceserver.jwt.issuer-uri", () -> EMISSOR);
        registro.add("spring.security.oauth2.resourceserver.jwt.jwk-set-uri",
                () -> "http://127.0.0.1:" + JWKS.getAddress().getPort() + "/certs");
        registro.add("spring.security.oauth2.resourceserver.jwt.audiences", () -> AUDIENCIA);
    }

    @AfterAll
    static void derrubarJwks() {
        JWKS.stop(0);
    }

    @Test
    void tokenValidoDeAnalistaLeOsRelatorios() throws Exception {
        mvc.perform(get("/api/relatorios").header("Authorization", "Bearer " + token(claims().build(), CHAVE)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.solicitante").value("ana"));
    }

    @Test
    void semTokenRecebe401() throws Exception {
        mvc.perform(get("/api/relatorios")).andExpect(status().isUnauthorized());
    }

    @Test
    void usuarioSemPapelDeAnalistaRecebe403() throws Exception {
        var semPapel = claims().claim("realm_access", Map.of("roles", List.of("usuario"))).build();
        mvc.perform(get("/api/relatorios").header("Authorization", "Bearer " + token(semPapel, CHAVE)))
                .andExpect(status().isForbidden());
    }

    @Test
    void tokenEmitidoParaOutroServicoERecusado() throws Exception {
        var outraAudiencia = claims().audience("outro-servico").build();
        mvc.perform(get("/api/relatorios").header("Authorization", "Bearer " + token(outraAudiencia, CHAVE)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void recusaNaoContaOMotivoNemOEnderecoInterno() throws Exception {
        var outraAudiencia = claims().audience("outro-servico").build();
        mvc.perform(get("/api/relatorios").header("Authorization", "Bearer " + token(outraAudiencia, CHAVE)))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("WWW-Authenticate", "Bearer error=\"invalid_token\""));
        mvc.perform(get("/api/relatorios"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("WWW-Authenticate", "Bearer error=\"invalid_token\""));
    }

    @Test
    void tokenDeOutroEmissorERecusado() throws Exception {
        var outroEmissor = claims().issuer("http://localhost:8180/realms/outro").build();
        mvc.perform(get("/api/relatorios").header("Authorization", "Bearer " + token(outroEmissor, CHAVE)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void tokenExpiradoERecusado() throws Exception {
        var expirado = claims()
                .issueTime(Date.from(Instant.now().minusSeconds(3600)))
                .expirationTime(Date.from(Instant.now().minusSeconds(1800)))
                .build();
        mvc.perform(get("/api/relatorios").header("Authorization", "Bearer " + token(expirado, CHAVE)))
                .andExpect(status().isUnauthorized());
    }

    /** Mesmo kid, chave diferente: quem forja o token não tem a chave privada do Keycloak. */
    @Test
    void tokenAssinadoComOutraChaveERecusado() throws Exception {
        mvc.perform(get("/api/relatorios").header("Authorization", "Bearer " + token(claims().build(), OUTRA_CHAVE)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void tokenSemAssinaturaComAlgNoneERecusado() throws Exception {
        String semAssinatura = new PlainJWT(claims().build()).serialize();
        mvc.perform(get("/api/relatorios").header("Authorization", "Bearer " + semAssinatura))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void rotaNaoMapeadaFicaFechadaMesmoComToken() throws Exception {
        mvc.perform(get("/api/outra-coisa").header("Authorization", "Bearer " + token(claims().build(), CHAVE)))
                .andExpect(status().isForbidden());
    }

    @Test
    void saudeEPublicaMasOResto() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
        mvc.perform(get("/actuator/env")).andExpect(status().isUnauthorized());
    }

    static JWTClaimsSet.Builder claims() {
        Instant agora = Instant.now();
        return new JWTClaimsSet.Builder()
                .issuer(EMISSOR)
                .subject("ana")
                .audience(AUDIENCIA)
                .issueTime(Date.from(agora))
                .expirationTime(Date.from(agora.plusSeconds(300)))
                .claim("realm_access", Map.of("roles", List.of("analista")));
    }

    static String token(JWTClaimsSet claims, RSAKey chave) throws Exception {
        var cabecalho = new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(chave.getKeyID()).type(JOSEObjectType.JWT).build();
        var jwt = new SignedJWT(cabecalho, claims);
        jwt.sign(new RSASSASigner(chave));
        return jwt.serialize();
    }

    static RSAKey gerarChave(String kid) {
        try {
            return new RSAKeyGenerator(2048).keyID(kid).generate();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static HttpServer subirJwks() {
        try {
            var servidor = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            byte[] corpo = new JWKSet(CHAVE.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
            servidor.createContext("/certs", troca -> {
                troca.getResponseHeaders().add("Content-Type", "application/json");
                troca.sendResponseHeaders(200, corpo.length);
                troca.getResponseBody().write(corpo);
                troca.close();
            });
            servidor.start();
            return servidor;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
