import Foundation
// The app's own online stack (OnlineSession, MahjongRoom, the engines), as a command-line
// player: `join CODE` takes a seat at a Mahjong table and plays it with MahjongAI.
@main struct Main {
    @MainActor static func main() async {
        let args = CommandLine.arguments
        let defaults = UserDefaults(suiteName: "qi-web-crossplay-\(UUID().uuidString)")!
        let s = OnlineSession(defaults: defaults)
        if args.count >= 2, args[1] == "host" {
            s.create(game: .mahjong, size: 9, seat: 0)
            while s.code == nil || s.seat == nil { try? await Task.sleep(for: .milliseconds(100)) }
            print("CODE \(s.code!)")
            try? s.code!.write(toFile: "code.txt", atomically: true, encoding: .utf8)
            while (s.info?.seats.count ?? 0) < 2 { try? await Task.sleep(for: .milliseconds(200)) }
            print("guest seated")
            try? await Task.sleep(for: .seconds(1))
            s.send(.rematch)
        } else {
            guard args.count >= 3, args[1] == "join" else { print("usage: join CODE | host"); return }
            s.join(args[2])
        }
        var answered = -1, hands = 0
        let start = Date()
        while Date().timeIntervalSince(start) < 600 {
            try? await Task.sleep(for: .milliseconds(300))
            if s.isHost, s.computerTurnDue { s.playComputerTurn(); continue }
            guard s.outbox.isEmpty, let record = s.record, let seat = s.seat,
                  let g = s.isHost ? s.mahjongHostGame : MahjongRoom.view(record, seat: seat, given: s.mahjongTiles) else { continue }
            switch g.phase {
            case .turn where g.turn == seat && g.hands[seat].allSatisfy({ $0 >= 0 }):
                let step = MahjongAI.turn(g, level: .normal)
                print("app plays \(step.code)")
                s.send(.move, move: step.code)
            case .claims where !g.claimOptions(seat).isEmpty && answered != g.steps.count:
                answered = g.steps.count
                let c = MahjongAI.claim(g, seat: seat, level: .normal)
                print("app answers \(MahjongRoom.answerCode(c, at: g.steps.count))")
                s.send(.move, move: MahjongRoom.answerCode(c, at: g.steps.count))
            case .over where record.rematch[String(seat)] != true:
                hands += 1
                print("HAND \(record.round) OVER steps=\(g.steps.count) winner=\(g.result?.winner.map(String.init) ?? "-") fans=\(g.result?.fans.map(\.rawValue) ?? []) change=\(g.result?.change ?? []) tilesKnown=\(s.mahjongTiles.count) openView=\(g.isOpenView)")
                print("STEPS \(g.steps.map(\.code).joined(separator: " "))")
                if hands >= 2 { print("DONE"); return }
                s.send(.rematch)
            default: break
            }
        }
    }
}
